/**
 * Closes an `AsyncDisposableRef`.
 *
 * @param {unknown} reason - The reason why the value is closed.
 * @param {AbortSignal} signal - A signal aborted if a new opening is performed while closing.
 * @returns {PromiseLike<void> | void} A promise fulfilled when the value is closed.
 *
 * **NOTE**: if the returned promise rejects because the `signal` was aborted (the rejection reason
 * is the signal's reason), the closing is considered canceled and the resource stays opened.
 * Any other rejection closes the resource anyway.
 */
export interface CloseAsyncDisposableRef {
  (reason: unknown, signal: AbortSignal): PromiseLike<void> | void;
}
