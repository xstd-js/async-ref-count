import type { Abortable } from '@xstd/abortable';
import { block } from '@xstd/block';
import { OpenAbortError } from '../open-abort-error/open-abort-error.ts';
import {
  type CloseSharedAsyncDisposableRef,
  SharedAsyncDisposableRef,
} from '../shared-async-disposable-ref/shared-async-disposable-ref.ts';
import type { AsyncDisposableRef } from '../types/async-disposable-ref.ts';
import type { CloseAsyncDisposableRef } from '../types/close-async-disposable-ref.ts';
import type { OpenAsyncDisposableRef } from '../types/open-async-disposable-ref.ts';

/**
 * Options for `AsyncRefCount`.
 */
export interface AsyncRefCountOptions {
  /**
   * A function called when an unexpected error occurs and cannot be reported to a caller,
   * like an open promise resolving after its abortion, or an unobserved close error.
   *
   * @defaultValue `(error) => console.warn(error)`
   */
  readonly onError?: (error: unknown) => void;
}

/**
 * An async reference counter used to open a resource only once and share it multiple times.
 *
 * The first `open()` call opens the resource once: concurrent and subsequent calls share the same
 * value until every returned `SharedAsyncDisposableRef` is closed. When the last one is released,
 * the resource is closed, and the next `open()` call opens it again.
 *
 * If the opening fails, every pending `open()` call rejects with the opening error.
 *
 * A close operation in-flight is aborted when a new open operation is requested: the `close()`
 * call which started it rejects with an `OpenAbortError`, and the resource stays opened.
 */
export class AsyncRefCount<GValue> {
  readonly #open: OpenAsyncDisposableRef<GValue>;
  readonly #onError: (error: unknown) => void;

  #count: number;
  #opened: boolean;
  #errorId: number;
  #resolveStateController: AbortController | undefined;
  #resolveStatePromise: Promise<readonly StateError[]> | undefined;

  // opened
  #value: GValue | undefined;
  #close: CloseAsyncDisposableRef | undefined;
  #closeShared: CloseSharedAsyncDisposableRef | undefined;

  // closing
  #closeReason: unknown | undefined;

  /**
   * Creates a new `AsyncRefCount`.
   *
   * @param {OpenAsyncDisposableRef<GValue>} open - The function opening the resource.
   * @param {AsyncRefCountOptions} [options] - The options.
   */
  constructor(
    open: OpenAsyncDisposableRef<GValue>,
    { onError = defaultOnError }: AsyncRefCountOptions = {},
  ) {
    this.#open = open;
    this.#onError = onError;
    this.#opened = false;
    this.#errorId = 0;
    this.#count = 0;
  }

  /**
   * Aborts the state transition in-flight, when it becomes useless or must be canceled.
   *
   * An open transition is aborted when nobody waits for it anymore (`#count === 0`),
   * and a close transition is aborted when a new open operation was requested (`#count > 0`).
   *
   * Also records `reason` as the reason of the next close transition (`#closeReason`).
   */
  #updateAbortControllers(reason: unknown = new OpenAbortError()): void {
    this.#closeReason = reason;

    if (this.#resolveStateController !== undefined) {
      if (this.#count === 0 && !this.#opened) {
        this.#resolveStateController.abort(reason);
      }

      if (this.#count > 0 && this.#opened) {
        this.#resolveStateController.abort(reason);
      }
    }
  }

  /**
   * The state machine: a single background loop performing the pending transitions, one at a time.
   *
   * It only leaves its loop in one of the two consistent "at rest" states:
   * - closed: `#count === 0` and `#opened === false`
   * - opened: `#count > 0` and `#opened === true`
   *
   * Every pushed `StateError` is routed to the callers waiting for the state resolution which
   * caused it (filtered by id): an "open" error rejects the pending `open()` calls, a "close"
   * error rejects the close operation which started it.
   *
   * Convergence invariant: the machine always converges on its own, and must always do so —
   * releases of references are always immediately followed by a call to this method, and no
   * external code can run between an at-rest transition and the resumption of the awaiting
   * callers. Any change introducing an `await` in an at-rest path must preserve this invariant.
   */
  #resolveState(): Promise<readonly StateError[]> {
    if (this.#resolveStatePromise === undefined) {
      this.#resolveStatePromise = block(async (): Promise<readonly StateError[]> => {
        const errors: StateError[] = [];

        while (true) {
          if (this.#count > 0 && !this.#opened) {
            const controller: AbortController = new AbortController();
            this.#resolveStateController = controller;

            let openFailed: boolean = false;

            await Promise.try(this.#open, controller.signal).then(
              ({ value, close, closeShared }: AsyncDisposableRef<GValue>): void => {
                this.#resolveStateController = undefined;

                this.#value = value;
                this.#close = close;
                this.#closeShared = closeShared;

                this.#opened = true;

                if (controller.signal.aborted) {
                  this.#onError(
                    new Error('The open promise was aborted, but the promise resolved.'),
                  );
                }
              },
              (error: unknown): void => {
                this.#resolveStateController = undefined;

                openFailed = true;

                errors.push({
                  id: this.#errorId++,
                  context: 'open',
                  error,
                });
              },
            );

            if (openFailed) {
              // the opening failed: pending "open" callers are rejected with the pushed error
              // and release their reference count contribution when resuming.
              // the state remains "closed": the next `open()` call retries the opening.
              // we cannot simply loop: it would retry the opening indefinitely while callers are waiting.
              break;
            }
          } else if (this.#count === 0 && this.#opened) {
            const controller: AbortController = new AbortController();
            this.#resolveStateController = controller;

            await Promise.try(this.#close!, this.#closeReason, controller.signal).then(
              (): void => {
                this.#closeReason = undefined;
                this.#resolveStateController = undefined;

                this.#value = undefined;
                this.#close = undefined;
                this.#closeShared = undefined;

                this.#opened = false;
              },
              (error: unknown): void => {
                this.#closeReason = undefined;
                this.#resolveStateController = undefined;

                let keepOpened: boolean = false;

                if (controller.signal.aborted) {
                  // if "close" rejects due to its abortion, we "cancel" the closing, meaning we end in the "opened" state instead of "closed".
                  if (error === controller.signal.reason) {
                    keepOpened = true;
                  } else {
                    this.#onError(
                      new Error(
                        "The close promise was aborted, but the promise rejected with a different error than the signal's reason.",
                        { cause: error },
                      ),
                    );
                  }
                }

                if (!keepOpened) {
                  this.#value = undefined;
                  this.#close = undefined;
                  this.#closeShared = undefined;

                  this.#opened = false;
                }

                errors.push({
                  id: this.#errorId++,
                  context: 'close',
                  error,
                });
              },
            );
          } else {
            break;
          }
        }

        return errors;
      }).finally((): void => {
        this.#resolveStatePromise = undefined;
      });
    }

    return this.#resolveStatePromise;
  }

  /**
   * Opens the resource, or shares it if already opened, and returns a `SharedAsyncDisposableRef`.
   *
   * If the opening fails, the returned promise rejects with the opening error:
   * no reference count contribution is kept, and a new `open()` call retries the opening.
   *
   * If the provided signal aborts while opening, the returned promise rejects with the signal's reason.
   */
  async open({ signal }: Abortable = {}): Promise<SharedAsyncDisposableRef<GValue>> {
    signal?.throwIfAborted();

    this.#count++;
    this.#updateAbortControllers();

    const onAbort = (): void => {
      signal!.removeEventListener('abort', onAbort);
      this.#count--;
      this.#updateAbortControllers(signal!.reason);
    };

    signal?.addEventListener('abort', onAbort);

    const errorId: number = this.#errorId;

    // await the state resolution, and keep only the errors which occurred while this call was
    // waiting: an "open" error rejects this call, a "close" error belongs to the close operation
    // which caused it (it is routed to its closer instead).
    const errors: readonly StateError[] = (await this.#resolveState()).filter(
      (error: StateError): boolean => {
        return error.id >= errorId;
      },
    );

    signal?.throwIfAborted();
    signal?.removeEventListener('abort', onAbort);

    if (errors.length > 0 && errors.at(-1)!.context === 'open') {
      // the opening failed: no `SharedAsyncDisposableRef` is handed out,
      // so this call's contribution to the reference count is released.
      // (unreachable when the signal aborted: `throwIfAborted` above rejects first,
      // and the "abort" listener already released this call's contribution)
      this.#count--;
      throw errors.at(-1)!.error;
    } else {
      return new SharedAsyncDisposableRef<GValue>(
        this.#value!,
        async (reason?: unknown): Promise<void> => {
          this.#count--;
          this.#updateAbortControllers(reason);

          const errorId: number = this.#errorId;

          // keep only the errors which occurred while this close was waiting: a "close" error
          // rejects this close, an "open" error belongs to the open operation which caused it.
          const resolveStatePromise: Promise<void> = this.#resolveState().then(
            (errors: readonly StateError[]): void => {
              errors = errors.filter((error: StateError): boolean => {
                return error.id >= errorId;
              });

              if (errors.length > 0 && errors.at(-1)!.context === 'close') {
                throw errors.at(-1)!.error;
              }
            },
          );

          if (this.#closeShared === undefined) {
            await resolveStatePromise;
          } else {
            resolveStatePromise.catch((error: unknown): void => {
              /* istanbul ignore else -- @preserve */
              if (error instanceof OpenAbortError) {
                return;
              }
              /* istanbul ignore next -- @preserve */
              (globalThis.reportError ?? console.error)(error);
            });

            await this.#closeShared(reason);
          }
        },
      );
    }
  }
}

/* INTERNAL */

function defaultOnError(error: unknown): void {
  console.warn(error);
}

interface StateError {
  readonly id: number;
  readonly context: 'open' | 'close';
  readonly error: unknown;
}
