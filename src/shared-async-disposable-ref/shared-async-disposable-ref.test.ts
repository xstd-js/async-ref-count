import { describe, expect, it } from 'vitest';
import { SharedAsyncDisposableRef } from './shared-async-disposable-ref.ts';

describe('SharedAsyncDisposableRef', () => {
  it('should close as expected', async () => {
    let closed: number = 0;

    const shared = new SharedAsyncDisposableRef(42, async () => {
      closed++;
    });

    expect(closed).toBe(0);

    expect(shared.value).toBe(42);
    expect(closed).toBe(0);

    await shared.close();
    expect(closed).toBe(1);
    expect(shared.closed).toBe(true);
  });

  it('should be async disposable', async () => {
    let closed: number = 0;

    {
      await using shared = new SharedAsyncDisposableRef(42, async () => {
        closed++;
      });

      expect(closed).toBe(0);

      expect(shared.value).toBe(42);
      expect(closed).toBe(0);
    }

    expect(closed).toBe(1);
  });

  it('should support concurrent close', async () => {
    const shared = new SharedAsyncDisposableRef(42, async () => {});

    await expect(Promise.all([shared.close(), shared.close()])).resolves.toBeDefined();
  });
});
