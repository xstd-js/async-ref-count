import type { CloseSharedAsyncDisposableRef } from '../shared-async-disposable-ref/shared-async-disposable-ref.ts';

import type { CloseAsyncDisposableRef } from './close-async-disposable-ref.ts';

/**
 * A reference to a value that can be "closed".
 */
export interface AsyncDisposableRef<GValue> {
  /**
   * The reference's value.
   */
  readonly value: GValue;

  /**
   * A function to "close" this reference. Called when the resource is no longer shared.
   */
  readonly close: CloseAsyncDisposableRef;

  /**
   * An optional function called when a `SharedAsyncDisposableRef` created from this reference
   * is closed, before the reference itself is closed.
   */
  readonly closeShared?: CloseSharedAsyncDisposableRef;
}
