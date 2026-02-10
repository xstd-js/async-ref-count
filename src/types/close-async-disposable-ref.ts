/**
 * Closes an `AsyncDisposableRef`.
 *
 * @param {unknown} reason - The reason why the value is closed.
 * @param {AbortSignal} signal - A signal aborted if a new opening is performed while closing.
 * @returns {PromiseLike<void> | void} A promise resolved when the ClosableValue is closed.
 */
export interface CloseAsyncDisposableRef {
  (reason: unknown, signal: AbortSignal): PromiseLike<void> | void;
}
