import type { AsyncDisposableRef } from './async-disposable-ref.ts';

/**
 * Opens a "disposable" value.
 *
 * @param {AbortSignal} signal - An optional signal to abort the opening process
 * @returns {PromiseLike<AsyncDisposableRef<GValue>> | AsyncDisposableRef<GValue>} A promise of a `AsyncDisposableRef` or directly a `AsyncDisposableRef`.
 */
export interface OpenAsyncDisposableRef<GValue> {
  (signal: AbortSignal): PromiseLike<AsyncDisposableRef<GValue>> | AsyncDisposableRef<GValue>;
}
