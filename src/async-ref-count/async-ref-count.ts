import type { Abortable } from '@xstd/abortable';
import { block } from '@xstd/block';
import {
  type CloseSharedAsyncDisposableRef,
  SharedAsyncDisposableRef,
} from '../shared-async-disposable-ref/shared-async-disposable-ref.ts';
import type { AsyncDisposableRef } from '../types/async-disposable-ref.ts';
import type { CloseAsyncDisposableRef } from '../types/close-async-disposable-ref.ts';
import type { OpenAsyncDisposableRef } from '../types/open-async-disposable-ref.ts';

/**
 * An async reference counter used to open a resource only once and share it multiple times.
 */
export class AsyncRefCount<GValue> {
  readonly #open: OpenAsyncDisposableRef<GValue>;

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

  constructor(open: OpenAsyncDisposableRef<GValue>) {
    this.#open = open;
    this.#opened = false;
    this.#errorId = 0;
    this.#count = 0;
  }

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

  #resolveState(): Promise<readonly StateError[]> {
    if (this.#resolveStatePromise === undefined) {
      this.#resolveStatePromise = block(async (): Promise<readonly StateError[]> => {
        // console.log('loop: start');
        const errors: StateError[] = [];

        while (true) {
          // console.log(`loop: { count: ${this.#count}, opened: ${this.#opened} }`);

          if (this.#count > 0 && !this.#opened) {
            // console.log('loop: open');
            const controller: AbortController = new AbortController();
            this.#resolveStateController = controller;

            await Promise.try(this.#open, controller.signal).then(
              ({ value, close, closeShared }: AsyncDisposableRef<GValue>): void => {
                this.#resolveStateController = undefined;

                this.#value = value;
                this.#close = close;
                this.#closeShared = closeShared;

                this.#opened = true;

                if (controller.signal.aborted) {
                  console.warn('The open promise was aborted, but the promise resolved.');
                }
              },
              (error: unknown): void => {
                this.#resolveStateController = undefined;

                this.#opened = true;

                errors.push({
                  id: this.#errorId++,
                  context: 'open',
                  error,
                });
              },
            );
          } else if (this.#count === 0 && this.#opened) {
            // console.log('loop: close');
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
                    console.warn(
                      "The close promise was aborted, but the promise rejected with a different error than the signal's reason.",
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

        // console.log('loop: done', errors);

        return errors;
      }).finally((): void => {
        this.#resolveStatePromise = undefined;
      });
    }

    return this.#resolveStatePromise;
  }

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

    // await opening
    const errors: readonly StateError[] = (await this.#resolveState()).filter(
      (error: StateError): boolean => {
        return error.id >= errorId;
      },
    );

    signal?.throwIfAborted();
    signal?.removeEventListener('abort', onAbort);

    if (errors.length > 0 && errors.at(-1)!.context === 'open') {
      throw errors.at(-1)!.error;
    } else {
      return new SharedAsyncDisposableRef<GValue>(
        this.#value!,
        async (reason?: unknown): Promise<void> => {
          this.#count--;
          this.#updateAbortControllers(reason);

          const errorId: number = this.#errorId;

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

class OpenAbortError extends Error {}

interface StateError {
  readonly id: number;
  readonly context: 'open' | 'close';
  readonly error: unknown;
}
