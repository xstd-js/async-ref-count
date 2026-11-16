import type { AsyncDisposableRef } from './async-disposable-ref.ts';

/**
 * Opens a "disposable" value.
 *
 * @param {AbortSignal} signal - A signal aborted when the opening becomes useless:
 *   the caller aborted its `open()` call, or nobody waits for the resource anymore.
 * @returns {PromiseLike<AsyncDisposableRef<GValue>> | AsyncDisposableRef<GValue>} A promise of a `AsyncDisposableRef` or directly a `AsyncDisposableRef`.
 */
export interface OpenAsyncDisposableRef<GValue> {
  (signal: AbortSignal): PromiseLike<AsyncDisposableRef<GValue>> | AsyncDisposableRef<GValue>;
}
