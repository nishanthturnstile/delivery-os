import { setTimeout as sleep } from 'node:timers/promises';

export interface StartupRetryOptions {
  check: () => Promise<void>;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  maxAttempts?: number;
  initialDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
}

export async function waitForDependencies({
  check,
  onRetry,
  maxAttempts = 5,
  initialDelayMs = 250,
  sleep: wait = sleep,
}: StartupRetryOptions): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await check();
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      const delayMs = initialDelayMs * 2 ** (attempt - 1);
      onRetry?.(attempt, error, delayMs);
      await wait(delayMs);
    }
  }
}
