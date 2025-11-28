import { type Abortable, abortify } from '@xstd/abortable';

/* TYPES */

/**
 * Opens a "closable" value.
 *
 * @param {AbortSignal} signal - An optional signal to abort the opening process
 * @returns A promise of a `ClosableValue` or a `ClosableValue` directly
 */
export interface OpenClosableValue<GValue> {
  (signal: AbortSignal): PromiseLike<ClosableValue<GValue>> | ClosableValue<GValue>;
}

/**
 * A value that can be "closed".
 * - `value`: any kind of value
 * - `close`: a function to "close" the value
 */
export interface ClosableValue<GValue> {
  readonly value: GValue;
  readonly close: CloseClosableValue;
}

/**
 * Closes a "closable" value.
 *
 * @param {unknown} reason - The reason why the value is closed
 * @param {AcquireCloseHook} hook - A function to acquire a hook to close the value asynchronously. The hook is called when the value is closed.
 * @returns A promise of void or void
 */
export interface CloseClosableValue {
  (reason: unknown, hook: AcquireCloseHook): PromiseLike<void> | void;
}

/**
 * Acquires a hook to close a "closable" value asynchronously.
 *
 * @returns {CloseHook} A hook to close the value asynchronously. The hook is called when the value is closed.
 */
export interface AcquireCloseHook {
  (): CloseHook;
}

/**
 * A hook to close a "closable" value asynchronously.
 * - `resolve`: a function to resolve the closing process
 * - `reject`: a function to reject the closing process
 * - `signal`: an `AbortSignal` to abort the closing process
 */
export interface CloseHook extends Pick<PromiseWithResolvers<any>, 'resolve' | 'reject'> {
  readonly signal: AbortSignal;
}

// derived

/**
 * A "closable" value derived from another one.
 * - `value`: any kind of value
 * - `close`: a function to close this derived "closable" value
 */
export interface DerivedClosableValue<GValue> {
  readonly value: GValue;
  readonly close: CloseDerivedClosableValue;
}

/**
 * Closes a derived "closable" value.
 */
export interface CloseDerivedClosableValue {
  (reason?: unknown): Promise<void>;
}

/* CLASS */

/**
 * An async reference counter used to open a resource only once and share it multiple times.
 */
export class AsyncRefCount<GValue> {
  readonly #open: OpenClosableValue<GValue>;

  #count: number;

  #openController: AbortController | undefined;
  #openPromise: Promise<ClosableValue<GValue>> | undefined;

  #closeController: AbortController | undefined;
  #closePromise: Promise<void> | undefined;

  constructor(open: OpenClosableValue<GValue>) {
    this.#open = open;
    this.#count = 0;
  }

  #close(close: CloseClosableValue, reason: unknown): Promise<void> {
    this.#closeController = new AbortController();
    const signal: AbortSignal = this.#closeController.signal;

    let hookPromise: Promise<void> | undefined;

    const closePromise: Promise<void> = Promise.try(close, reason, (): CloseHook => {
      if (hookPromise !== undefined) {
        throw new Error('Close hook locked.');
      }
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      hookPromise = promise;
      return {
        resolve,
        reject,
        signal,
      };
    });

    if (hookPromise === undefined) {
      hookPromise = closePromise.catch((): void => {});
    } else {
      hookPromise = hookPromise.catch((error: unknown): void => {
        if (!signal.aborted || error !== signal.reason) {
          reportError(error);
        }
      });
    }

    this.#closePromise = hookPromise.finally((): void => {
      if (!signal.aborted) {
        this.#openPromise = undefined;
      }
      this.#closeController = undefined;
      this.#closePromise = undefined;
    });

    return closePromise;
  }

  async open({ signal }: Abortable = {}): Promise<DerivedClosableValue<GValue>> {
    signal?.throwIfAborted();

    if (this.#closePromise !== undefined) {
      this.#closeController!.abort();

      await abortify(this.#closePromise, { signal });
    }

    this.#count++;

    if (this.#openPromise === undefined) {
      const openController: AbortController = new AbortController();
      this.#openController = openController;
      this.#openPromise = Promise.try(this.#open, openController.signal).then(
        (value: ClosableValue<GValue>): ClosableValue<GValue> => {
          openController.abort();
          if (this.#openController === openController) {
            this.#openController = undefined;
          }
          return value;
        },
        (error: unknown): never => {
          openController.abort();
          if (this.#openController === openController) {
            this.#openController = undefined;
            this.#openPromise = undefined;
          }
          throw error;
        },
      );
    }

    try {
      const { value, close }: ClosableValue<GValue> = await abortify(this.#openPromise, {
        signal,
      });

      let closed: boolean = false;

      return {
        value,
        close: async (reason?: unknown): Promise<void> => {
          if (closed) {
            throw new Error('Already closed.');
          }
          closed = true;

          this.#count--;

          if (this.#count === 0) {
            await this.#close(close, reason);
          }
        },
      };
    } catch (error: unknown) {
      try {
        // => failed to open shared resource OR signal aborted
        this.#count--;

        if (this.#count === 0) {
          this.#openController?.abort(error);
          // safeguard: if `openPromise` fulfills (however, rejection is expected), we close it immediately
          await this.#close((await this.#openPromise).close, error);
        }
      } finally {
        throw error;
      }
    }
  }
}
