import { abortify } from '@xstd/abortable';
import { describe, expect, it, test, vi } from 'vitest';
import { TestTools } from '../../fabrique/test/tools.ts';
import type { SharedAsyncDisposableRef } from '../shared-async-disposable-ref/shared-async-disposable-ref.ts';
import { AsyncRefCount } from './async-ref-count.ts';

describe('AsyncRefCount', () => {
  it('should share a value', async () => {
    let opened: number = 0;
    let closed: number = 0;
    let closeReason: unknown;

    const factory = new AsyncRefCount(() => {
      opened++;

      return {
        value: 42,
        close: async (reason: unknown) => {
          closed++;
          closeReason = reason;
        },
      };
    });

    expect(opened).toBe(0);
    expect(closed).toBe(0);
    expect(closeReason).toBeUndefined();

    // 1) open a new shared ref => A
    const sharedA = await factory.open();
    expect(sharedA.value).toBe(42);
    expect(opened).toBe(1);
    expect(closed).toBe(0);
    expect(closeReason).toBeUndefined();

    // 2) open a new shared ref => B
    // EXPECTED: A should share the same value as B
    const sharedB = await factory.open();
    expect(sharedB.value).toBe(42);
    expect(opened).toBe(1);
    expect(closed).toBe(0);
    expect(closeReason).toBeUndefined();

    // 3) close B => A should still be opened as well as the initial reference
    await sharedB.close();
    expect(opened).toBe(1);
    expect(closed).toBe(0);

    // 4) close B => A and B should be closed, and the "initial reference" should be closed as well
    await sharedA.close('close reason');
    expect(opened).toBe(1);
    expect(closed).toBe(1);
    expect(closeReason).toBe('close reason');

    // 5) open a new shared ref => C
    // EXPECTED: should open a new "initial reference"
    const sharedC = await factory.open();
    expect(sharedC.value).toBe(42);
    expect(opened).toBe(2);
    expect(closed).toBe(1);
  });

  it('should support errors while opening', async () => {
    let opening: number = 0;

    const factory = new AsyncRefCount(() => {
      opening++;

      throw 'error';
    });

    expect(opening).toBe(0);

    // 1) open a new shared ref throwing an error
    // EXPECTED: the open promise should be rejected with the error
    await expect(factory.open()).rejects.toThrow('error');
    expect(opening).toBe(1);
  });

  it('should support errors while closing', async () => {
    const factory = new AsyncRefCount(() => {
      return {
        value: 42,
        close: async () => {
          throw 'error';
        },
      };
    });

    // 1) open a new shared ref
    const shared = await factory.open();
    expect(shared.value).toBe(42);

    // 2) close the shared ref, with a close function throwing an error
    // EXPECTED: the close promise should be rejected with the error
    await expect(shared.close()).rejects.toThrow('error');
  });

  it('should support abortion while opening', async () => {
    let opening: number = 0;
    let opened: number = 0;
    let openPromise: PromiseWithResolvers<void> | undefined = undefined;

    const factory = new AsyncRefCount(async (signal: AbortSignal) => {
      opening++;
      openPromise = Promise.withResolvers();
      await abortify(openPromise.promise, { signal });
      opened++;

      return {
        value: 42,
        close: async () => {},
      };
    });

    expect(opening).toBe(0);
    expect(opened).toBe(0);
    expect(openPromise).toBeUndefined();

    const controller = new AbortController();

    // 1) open a new shared ref, with an abort signal
    const promise = factory.open({ signal: controller.signal });
    expect(opening).toBe(1);
    expect(opened).toBe(0);
    expect(openPromise).toBeDefined();

    // 2) abort the open operation
    controller.abort('error');
    openPromise!.resolve();
    openPromise = undefined;

    // EXPECTED: the open promise should be rejected with the error
    await expect(promise).rejects.toBe('error');

    expect(opening).toBe(1);
    expect(opened).toBe(0);
    expect(openPromise).toBeUndefined();
  });

  it('should support abortion while opening - with concurent opening', async () => {
    let opening: number = 0;
    let opened: number = 0;
    let openPromise: PromiseWithResolvers<void> | undefined = undefined;

    const factory = new AsyncRefCount(async (signal: AbortSignal) => {
      opening++;
      openPromise = Promise.withResolvers();
      await abortify(openPromise.promise, { signal });
      opened++;

      return {
        value: 42,
        close: async () => {},
      };
    });

    expect(opening).toBe(0);
    expect(opened).toBe(0);
    expect(openPromise).toBeUndefined();

    const controller = new AbortController();

    // 1) open two shared refs (the second with an abort signal)
    const allSettled = Promise.allSettled([
      factory.open(),
      factory.open({ signal: controller.signal }),
    ]);

    // EXPECTED: the open function should be called only once
    expect(opening).toBe(1);
    expect(opened).toBe(0);
    expect(openPromise).toBeDefined();

    // 2) abort the open operation of the second shared ref
    controller.abort('error');
    openPromise!.resolve();
    openPromise = undefined;

    const results = await allSettled;

    expect(opening).toBe(1);
    expect(opened).toBe(1);
    expect(openPromise).toBeUndefined();

    // EXPECTED: the first shared ref should be fulfilled with the value
    expect(results[0].status).toBe('fulfilled');
    expect(
      (results[0] as PromiseFulfilledResult<SharedAsyncDisposableRef<number>>).value.value,
    ).toBe(42);

    // EXPECTED: the second shared ref should be rejected with the abort error
    expect(results[1].status).toBe('rejected');
    expect((results[1] as PromiseRejectedResult).reason).toBe('error');

    expect(opening).toBe(1);
    expect(opened).toBe(1);
    expect(openPromise).toBeUndefined();
  });

  it('should support abortion while opening - open fulfills', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let opening: number = 0;
    let opened: number = 0;
    let closed: number = 0;
    let openPromise: PromiseWithResolvers<void> | undefined = undefined;

    const factory = new AsyncRefCount(async () => {
      opening++;
      openPromise = Promise.withResolvers();
      await openPromise.promise;
      opened++;

      return {
        value: 42,
        close: async () => {
          closed++;
        },
      };
    });

    expect(opening).toBe(0);
    expect(opened).toBe(0);
    expect(closed).toBe(0);
    expect(openPromise).toBeUndefined();

    const controller = new AbortController();

    // 1) open a new shared ref with an abort signal
    const promise = factory.open({ signal: controller.signal });
    expect(opening).toBe(1);
    expect(opened).toBe(0);
    expect(closed).toBe(0);
    expect(openPromise).toBeDefined();

    // 2) abort the open operation, BUT resolve the open promise with success instead of rejection
    controller.abort('error');
    openPromise!.resolve();
    openPromise = undefined;

    // EXPECTED: the open promise should be rejected with the abort error
    await expect(promise).rejects.toThrow('error');

    // EXPECTED: the initial reference should be closed, as the opening was aborted
    expect(opening).toBe(1);
    expect(opened).toBe(1);
    expect(closed).toBe(1);
    expect(openPromise).toBeUndefined();

    expect(spy).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });

  it('should await closing any previous task while opening - close fulfills', async () => {
    let opened: number = 0;
    let closing: number = 0;
    let closed: number = 0;
    let closePromise: PromiseWithResolvers<void> | undefined = undefined;

    const factory = new AsyncRefCount(async () => {
      opened++;

      return {
        value: 42,
        close: async () => {
          closing++;
          closePromise = Promise.withResolvers();
          await closePromise.promise;
          closed++;
        },
      };
    });

    expect(opened).toBe(0);
    expect(closing).toBe(0);
    expect(closed).toBe(0);
    expect(closePromise).toBeUndefined();

    // 1) open a new shared ref => A
    const sharedA = await factory.open();
    expect(sharedA.value).toBe(42);
    expect(opened).toBe(1);
    expect(closing).toBe(0);
    expect(closed).toBe(0);
    expect(closePromise).toBeUndefined();

    // 2) close this shared ref A
    const sharedAClosePromise = sharedA.close();
    expect(opened).toBe(1);
    expect(closing).toBe(1);
    expect(closed).toBe(0);
    expect(closePromise).toBeDefined();

    // 3) open a new shared ref B while the previous one (A) is still closing => closing should abort, BUT we force instead fulfillment of the close promise
    // EXPECTED: close should be awaited
    const sharedBOpenPromise = factory.open();
    expect(opened).toBe(1);
    expect(closing).toBe(1);
    expect(closed).toBe(0);
    expect(closePromise).toBeDefined();

    // 4) resolve the closing promise
    closePromise!.resolve();
    closePromise = undefined;

    // 5) await the shared ref B opening, and ensure that the initial reference closing was awaited
    // EXPECTED: the initial reference should have been closed successfully
    const sharedB = await sharedBOpenPromise;
    expect(sharedB.value).toBe(42);
    expect(opened).toBe(2);
    expect(closing).toBe(1);
    expect(closed).toBe(1);
    expect(closePromise).toBeUndefined();

    // EXPECTED: the shared ref A should have been closed successfully
    await expect(sharedAClosePromise).resolves.toBeUndefined();
  });

  it('should await closing any previous task while opening - close is aborted', async () => {
    let opened: number = 0;
    let closing: number = 0;
    let closed: number = 0;
    let closePromise: PromiseWithResolvers<void> | undefined = undefined;

    const factory = new AsyncRefCount(async () => {
      opened++;

      return {
        value: 42,
        close: async (_reason: unknown, signal: AbortSignal) => {
          closing++;
          closePromise = Promise.withResolvers();
          await abortify(closePromise.promise, { signal });
          closed++;
        },
      };
    });

    expect(opened).toBe(0);
    expect(closing).toBe(0);
    expect(closed).toBe(0);
    expect(closePromise).toBeUndefined();

    // 1) open a new shared ref => A
    const sharedA = await factory.open();
    expect(sharedA.value).toBe(42);
    expect(opened).toBe(1);
    expect(closing).toBe(0);
    expect(closed).toBe(0);
    expect(closePromise).toBeUndefined();

    // 2) close this shared ref A
    const sharedAClosePromise = sharedA.close();
    expect(opened).toBe(1);
    expect(closing).toBe(1);
    expect(closed).toBe(0);
    expect(closePromise).toBeDefined();

    // 3) open a new shared ref B while the previous one (A) is still closing
    // EXPECTED: closing should be aborted
    const sharedBOpenPromise = factory.open();
    expect(opened).toBe(1);
    expect(closing).toBe(1);
    expect(closed).toBe(0);
    expect(closePromise).toBeDefined();

    // 4) resolve the closing promise
    closePromise!.resolve();
    closePromise = undefined;

    /// 5) await the shared ref B opening, and ensure the initial reference closing was aborted
    // EXPECTED: the initial reference closing should have been aborted successfully
    const sharedB = await sharedBOpenPromise;
    expect(sharedB.value).toBe(42);
    expect(opened).toBe(1);
    expect(closing).toBe(1);
    expect(closed).toBe(0);
    expect(closePromise).toBeUndefined();

    // EXPECTED: the shared ref A should have been closed with an error (because it was aborted by the shared ref B opening)
    await expect(sharedAClosePromise).rejects.toThrow();
  });

  it('should await closing any previous task while opening - close is rejected', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let opened: number = 0;
    let closing: number = 0;
    let closed: number = 0;
    let closePromise: PromiseWithResolvers<void> | undefined = undefined;

    const factory = new AsyncRefCount(async () => {
      opened++;

      return {
        value: 42,
        close: async () => {
          closing++;
          closePromise = Promise.withResolvers();
          await closePromise.promise;
          closed++;
        },
      };
    });

    expect(opened).toBe(0);
    expect(closing).toBe(0);
    expect(closed).toBe(0);
    expect(closePromise).toBeUndefined();

    // 1) open a new shared ref => A
    const sharedA = await factory.open();
    expect(sharedA.value).toBe(42);
    expect(opened).toBe(1);
    expect(closing).toBe(0);
    expect(closed).toBe(0);
    expect(closePromise).toBeUndefined();

    // 2) close this shared ref A
    const sharedAClosePromise = sharedA.close();
    expect(opened).toBe(1);
    expect(closing).toBe(1);
    expect(closed).toBe(0);
    expect(closePromise).toBeDefined();

    // 3) open a new shared ref B while the previous one (A) is still closing => closing should abort, BUT we force instead rejection of the close promise
    // EXPECTED: close should be awaited
    const sharedBOpenPromise = factory.open();
    expect(opened).toBe(1);
    expect(closing).toBe(1);
    expect(closed).toBe(0);
    expect(closePromise).toBeDefined();

    // 4) reject the closing promise
    closePromise!.reject('error');
    closePromise = undefined;

    /// 5) await the shared ref B opening, and ensure closing was rejected
    // EXPECTED: the initial reference closing should have been rejected
    const sharedB = await sharedBOpenPromise;
    expect(sharedB.value).toBe(42);
    expect(opened).toBe(2);
    expect(closing).toBe(1);
    expect(closed).toBe(0);

    // EXPECTED: the shared ref A should have been closed with an error (because closing was rejected)
    await expect(sharedAClosePromise).rejects.toThrow('error');

    expect(spy).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });

  it('should await closing any previous task while opening - open is aborted while closing', async () => {
    let opened: number = 0;
    let closing: number = 0;
    let closed: number = 0;
    let closePromise: PromiseWithResolvers<void> | undefined = undefined;

    const factory = new AsyncRefCount(async () => {
      opened++;

      return {
        value: 42,
        close: async (_reason: unknown, signal: AbortSignal) => {
          closing++;
          closePromise = Promise.withResolvers();
          await abortify(closePromise.promise, { signal });
          closed++;
        },
      };
    });

    expect(opened).toBe(0);
    expect(closing).toBe(0);
    expect(closed).toBe(0);
    expect(closePromise).toBeUndefined();

    // 1) open a new shared ref => A
    const sharedA = await factory.open();
    expect(sharedA.value).toBe(42);
    expect(opened).toBe(1);
    expect(closing).toBe(0);
    expect(closed).toBe(0);
    expect(closePromise).toBeUndefined();

    // 2) close this shared ref A
    // EXPECTED: the initial reference should start closing
    const sharedAClosePromise = sharedA.close();
    expect(opened).toBe(1);
    expect(closing).toBe(1);
    expect(closed).toBe(0);
    expect(closePromise).toBeDefined();

    const controller = new AbortController();

    // 3) open a new shared ref B while the previous one (A) is still closing
    // EXPECTED: the initial reference closing should be aborted
    const sharedBOpenPromise = factory.open({ signal: controller.signal });
    expect(opened).toBe(1);
    expect(closing).toBe(1);
    expect(closed).toBe(0);
    expect(closePromise).toBeDefined();

    // 4) abort the open operation of the shared ref B
    controller.abort('error');
    // and resolve the close promise
    closePromise!.resolve();
    closePromise = undefined;

    // 5) await until the initial reference starts closing again
    while (closePromise === undefined) {
      await Promise.resolve();
    }

    expect(closePromise).toBeDefined();

    // 6) resolve the closing promise of the initial reference
    // @ts-ignore
    closePromise!.resolve();
    closePromise = undefined;

    // EXPECTED: the shared ref B opening should be aborted (the promise should be rejected)
    await expect(sharedBOpenPromise).rejects.toThrow();

    // EXPECTED: the initial reference should be closed
    expect(opened).toBe(1);
    expect(closing).toBe(2);
    expect(closed).toBe(1);
    expect(closePromise).toBeUndefined();

    // EXPECTED: the shared ref A should closing should reject as it was canceled by the shared ref B opening
    await expect(sharedAClosePromise).rejects.toThrow();
  });

  test('everything', async () => {
    let opening: number = 0;
    let opened: number = 0;
    let closing: number = 0;
    let closed: number = 0;
    let sharedClosing: number = 0;
    let sharedClosed: number = 0;

    const factory = new AsyncRefCount(async (signal: AbortSignal) => {
      opening++;
      await TestTools.sleep(100, signal);
      opened++;

      return {
        value: 42,
        close: async (_reason: unknown, signal: AbortSignal) => {
          closing++;
          await TestTools.sleep(100, signal);
          closed++;
        },
        closeShared: async () => {
          sharedClosing++;
          await TestTools.sleep(50);
          sharedClosed++;
        },
      };
    });

    expect(opening).toBe(0);
    expect(opened).toBe(0);
    expect(closing).toBe(0);
    expect(closed).toBe(0);
    expect(sharedClosing).toBe(0);
    expect(sharedClosed).toBe(0);

    // 1) open a new shared ref => A
    const sharedA = await factory.open();
    expect(sharedA.value).toBe(42);
    expect(opening).toBe(1);
    expect(opened).toBe(1);
    expect(closing).toBe(0);
    expect(closed).toBe(0);
    expect(sharedClosing).toBe(0);
    expect(sharedClosed).toBe(0);

    // 2) close shared ref A
    // EXPECTED: "closeShared" should be called as well as "close"
    await sharedA.close();
    expect(opening).toBe(1);
    expect(opened).toBe(1);
    expect(closing).toBe(1);
    // EXPECTED: initial reference should be closed yet
    expect(closed).toBe(0);
    expect(sharedClosing).toBe(1);
    expect(sharedClosed).toBe(1);

    // 3) open a new shared ref => B
    // EXPECTED: "close" should be aborted
    const sharedB = await factory.open();
    expect(sharedB.value).toBe(42);
    expect(opening).toBe(1);
    expect(opened).toBe(1);
    expect(closing).toBe(1);
    expect(closed).toBe(0);
    expect(sharedClosing).toBe(1);
    expect(sharedClosed).toBe(1);

    // 3) close shared ref B
    await sharedB.close();
    // await initial reference closing
    await TestTools.sleep(100);

    // EXPECTED: "close" should complete
    expect(opening).toBe(1);
    expect(opened).toBe(1);
    expect(closing).toBe(2);
    expect(closed).toBe(1);
    expect(sharedClosing).toBe(2);
    expect(sharedClosed).toBe(2);
  });
});
