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
 * Runs `operation` with a deadline. The operation receives an AbortSignal that is
 * aborted (with the DeadlineError as its reason) when the deadline passes, so a hung
 * call can release its sockets, streams, etc. The timer is always cleared once the
 * returned promise settles, so nothing started here outlives the call.
 */
export function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  opts: DeadlineOptions,
): Promise<T> {
  const { timeoutMs } = opts;
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
    return Promise.reject(
      new RangeError(`timeoutMs must be a finite, non-negative number; got ${timeoutMs}`),
    );
  }
  const setTimer = opts.setTimer ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
  const clearTimer =
    opts.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timerSet = false;
    let handle: unknown;

    const finish = (): boolean => {
      if (settled) return false;
      settled = true;
      if (timerSet) {
        timerSet = false;
        clearTimer(handle);
      }
      return true;
    };

    handle = setTimer(() => {
      // The timer has fired, so there is nothing left to clear.
      timerSet = false;
      if (settled) return;
      settled = true;
      const error = new DeadlineError(timeoutMs);
      reject(error);
      // Tell the operation to stop so a hung call releases what it holds.
      controller.abort(error);
    }, timeoutMs);
    // A synchronous setTimer may already have fired the callback.
    timerSet = !settled;

    let pending: Promise<T>;
    try {
      pending = Promise.resolve(operation(controller.signal));
    } catch (err) {
      if (finish()) reject(err);
      return;
    }

    // Both handlers are always attached, so a late rejection from an operation that
    // already lost the race is never reported as unhandled.
    pending.then(
      (value) => {
        if (finish()) resolve(value);
      },
      (err: unknown) => {
        if (finish()) reject(err);
      },
    );
  });
}
