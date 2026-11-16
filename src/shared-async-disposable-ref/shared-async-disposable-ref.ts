export interface CloseSharedAsyncDisposableRef {
  (reason?: unknown): PromiseLike<void> | void;
}

export class SharedAsyncDisposableRef<GValue> {
  readonly #value: GValue;
  readonly #close: CloseSharedAsyncDisposableRef;
  #closePromise: Promise<void> | undefined;

  constructor(value: GValue, close: CloseSharedAsyncDisposableRef) {
    this.#value = value;
    this.#close = close;
  }

  get value(): GValue {
    return this.#value;
  }

  get closed(): boolean {
    return this.#closePromise !== undefined;
  }

  close(reason?: unknown): Promise<void> {
    if (this.#closePromise === undefined) {
      this.#closePromise = Promise.try(this.#close, reason);
    }
    return this.#closePromise;
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
