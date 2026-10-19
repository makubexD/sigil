/** Largest delay `setTimeout` honours; larger values overflow and fire after ~1ms. */
const MAX_TIMEOUT_MS = 2_147_483_647;

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
 * Runs `operation`, rejecting with a `DeadlineError` if it has not settled within
 * `opts.timeoutMs`. On timeout the signal passed to `operation` is aborted (reason: the
 * `DeadlineError`) so the operation can release its resources. Once the returned promise
 * settles, the timer is cleared and a late result from the operation is ignored.
 */
export function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  opts: DeadlineOptions,
): Promise<T> {
  const { timeoutMs } = opts;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > MAX_TIMEOUT_MS) {
    return Promise.reject(
      new RangeError(`timeoutMs must be a finite number in [0, ${MAX_TIMEOUT_MS}], got ${timeoutMs}`),
    );
  }
  const setTimer = opts.setTimer ?? ((cb: () => void, ms: number): unknown => setTimeout(cb, ms));
  const clearTimer =
    opts.clearTimer ?? ((handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>));

  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timerArmed = false;
    let timerHandle: unknown;

    // Settles exactly once and disarms the timer. Called from the timer, the operation's
    // outcome, or a synchronous failure, whichever comes first.
    const finish = (settle: () => void): void => {
      if (settled) return;
      settled = true;
      if (timerArmed) {
        timerArmed = false;
        clearTimer(timerHandle);
      }
      timerHandle = undefined;
      settle();
    };

    const onTimeout = (): void => {
      if (settled) return;
      timerArmed = false; // the timer has fired; there is nothing left to clear
      const error = new DeadlineError(timeoutMs);
      finish(() => reject(error));
      // Abort after settling so listeners that throw cannot prevent the rejection.
      controller.abort(error);
    };

    try {
      timerArmed = true;
      timerHandle = setTimer(onTimeout, timeoutMs);
    } catch (error) {
      timerArmed = false;
      finish(() => reject(error));
      return;
    }
    // A custom timer may fire synchronously; don't start the operation in that case.
    if (settled) return;

    let pending: Promise<T>;
    try {
      pending = Promise.resolve(operation(controller.signal));
    } catch (error) {
      finish(() => reject(error));
      return;
    }
    // Both handlers are always attached, so a rejection arriving after the deadline is
    // consumed here rather than surfacing as an unhandled rejection.
    pending.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}
