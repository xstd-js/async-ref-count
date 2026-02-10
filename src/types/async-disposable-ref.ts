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
   * A function to "close" this reference.
   */
  readonly close: CloseAsyncDisposableRef;

  /**
   * A function called when a `SharedAsyncDisposableRef` is closed.
   */
  readonly closeShared?: CloseSharedAsyncDisposableRef;
}
