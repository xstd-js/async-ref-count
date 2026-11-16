/**
 * Closes a `SharedAsyncDisposableRef`.
 *
 * @param {unknown} reason - The reason why the shared reference is closed.
 * @returns {PromiseLike<void> | void} A promise fulfilled when the close operation completes.
 */
export interface CloseSharedAsyncDisposableRef {
  (reason?: unknown): PromiseLike<void> | void;
}

/**
 * A shared reference to a value opened by an `AsyncRefCount`.
 *
 * It holds the shared value, and releases its contribution to the reference count when closed:
 * the underlying resource is closed when the last shared reference is released.
 */
export class SharedAsyncDisposableRef<GValue> {
  readonly #value: GValue;
  readonly #close: CloseSharedAsyncDisposableRef;
  #closePromise: Promise<void> | undefined;

  constructor(value: GValue, close: CloseSharedAsyncDisposableRef) {
    this.#value = value;
    this.#close = close;
  }

  /**
   * The shared value.
   */
  get value(): GValue {
    return this.#value;
  }

  /**
   * Returns `true` once `close()` has been called on this reference.
   *
   * **NOTE**: this is `true` while the close operation is still in-flight: it means "close requested",
   * not "close completed".
   */
  get closed(): boolean {
    return this.#closePromise !== undefined;
  }

  /**
   * Closes this reference. Releases its contribution to the reference count of the `AsyncRefCount`
   * which created it: when the last reference is released, the resource itself is closed.
   *
   * Calling it multiple times returns the same promise.
   *
   * @param {unknown} reason - The reason why this reference is closed.
   * @returns {Promise<void>} A promise fulfilled when the close operation was accepted, rejected if it failed.
   */
  close(reason?: unknown): Promise<void> {
    if (this.#closePromise === undefined) {
      this.#closePromise = Promise.try(this.#close, reason);
    }
    return this.#closePromise;
  }

  /**
   * Implements `await using`: closes this reference without a reason.
   *
   * @returns {Promise<void>} The `close()` promise.
   */
  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
