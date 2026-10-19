const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export class DeadlineError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Operation did not settle within ${timeoutMs}ms`);
    this.name = 'DeadlineError';
    this.timeoutMs = timeoutMs;
  }
}

export interface DeadlineOptions {
  timeoutMs: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Runs `operation` with an AbortSignal and settles with its result, or rejects
 * with a DeadlineError if it has not settled within `opts.timeoutMs`.
 *
 * On timeout the signal is aborted (reason: the DeadlineError) so the operation
 * can release whatever it holds. Whichever way it settles, the timer is cleared,
 * and a late result or rejection from the operation is swallowed.
 */
export function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  opts: DeadlineOptions,
): Promise<T> {
  const { timeoutMs } = opts;
  // setTimeout silently turns NaN, Infinity, and anything above 2^31-1 into ~1ms,
  // so reject those up front instead of timing out immediately.
  const maxMs = opts.setTimer ? Number.MAX_SAFE_INTEGER : MAX_TIMEOUT_MS;
  if (typeof timeoutMs !== 'number' || !(timeoutMs >= 0 && timeoutMs <= maxMs)) {
    return Promise.reject(
      new RangeError(`timeoutMs must be a number between 0 and ${maxMs}, got ${String(timeoutMs)}`),
    );
  }
  const setTimer = opts.setTimer ?? setTimeout;
  const clearTimer = opts.clearTimer ?? ((handle: unknown) => clearTimeout(handle as never));

  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timerArmed = false;
    let handle: unknown;

    const finish = (): boolean => {
      if (settled) return false;
      settled = true;
      if (timerArmed) {
        timerArmed = false;
        clearTimer(handle);
        handle = undefined;
      }
      return true;
    };

    let pending: Promise<T>;
    try {
      pending = Promise.resolve(operation(controller.signal));
    } catch (error) {
      finish();
      reject(error);
      return;
    }

    pending.then(
      (value) => {
        if (finish()) resolve(value);
      },
      (error: unknown) => {
        if (finish()) reject(error);
      },
    );

    const onTimeout = (): void => {
      if (settled) return;
      settled = true;
      timerArmed = false;
      handle = undefined;
      const error = new DeadlineError(timeoutMs);
      reject(error);
      controller.abort(error);
    };

    let h: unknown;
    try {
      h = setTimer(onTimeout, timeoutMs);
    } catch (error) {
      // Without a timer the operation is unbounded: stop it rather than leak it.
      if (finish()) {
        reject(error);
        controller.abort(error);
      }
      return;
    }
    // A custom setTimer may invoke the callback synchronously; only keep the
    // handle if the timer is still outstanding.
    if (!settled) {
      handle = h;
      timerArmed = true;
    }
  });
}
