import { describe, expect, it, vi } from 'vitest';

import { waitForDependencies } from './startup-retry';

describe('waitForDependencies', () => {
  it('retries with bounded exponential backoff and then succeeds', async () => {
    const check = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockRejectedValueOnce(new Error('redis unavailable'))
      .mockResolvedValue();
    const sleep = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue();
    const onRetry = vi.fn();

    await waitForDependencies({ check, sleep, onRetry, maxAttempts: 5, initialDelayMs: 100 });

    expect(check).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[100], [200]]);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('fails after the configured final attempt without an unbounded wait', async () => {
    const failure = new Error('dependencies unavailable');
    const check = vi.fn<() => Promise<void>>().mockRejectedValue(failure);
    const sleep = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue();

    await expect(
      waitForDependencies({ check, sleep, maxAttempts: 3, initialDelayMs: 50 }),
    ).rejects.toBe(failure);
    expect(check).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[50], [100]]);
  });
});
