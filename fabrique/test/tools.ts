export class TestTools {
  static sleep(duration: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve: () => void, reject: (reason?: unknown) => void): void => {
      signal?.throwIfAborted();

      const end = (): void => {
        signal?.removeEventListener('abort', onAbort);
        clearTimeout(timer);
      };

      const onAbort = (): void => {
        end();
        reject(signal!.reason);
      };

      signal?.addEventListener('abort', onAbort);

      const timer: any = setTimeout((): void => {
        end();
        resolve();
      }, duration);
    });
  }

  static polyfillRequestIdleCallback(): void {
    globalThis.requestIdleCallback ??= (
      callback: IdleRequestCallback,
      { timeout = 0 }: IdleRequestOptions = {},
    ): number => {
      return setTimeout(callback, timeout);
    };

    globalThis.cancelIdleCallback ??= (handle: number): void => {
      clearTimeout(handle);
    };
  }

  static gc(): void {
    if (typeof (globalThis as any).gc === 'function') {
      return (globalThis as any).gc!();
    } else {
      throw new Error('Missing `gc` function. Did you `--expose-gc` ?');
    }
  }
}
