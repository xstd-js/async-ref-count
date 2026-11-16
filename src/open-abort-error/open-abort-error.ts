/**
 * Error rejecting the `close()` call of a `SharedAsyncDisposableRef` when its underlying close operation
 * was aborted because a new open operation was requested on the same `AsyncRefCount`.
 *
 * The close operation is "canceled": the resource stays opened for the new open operation.
 */
export class OpenAbortError extends Error {
  constructor() {
    super('The close operation was aborted because a new open operation was requested.');
    this.name = 'OpenAbortError';
  }
}
