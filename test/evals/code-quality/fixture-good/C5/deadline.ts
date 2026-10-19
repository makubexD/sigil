export class DeadlineError extends Error {
  constructor(timeoutMs: number) {
    super(`operation did not finish within ${timeoutMs} ms`);
    this.name = 'DeadlineError';
  }
}

export function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  opts: {
    timeoutMs: number;
    setTimer?: (callback: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
  },
): Promise<T> {
  const { timeoutMs, setTimer = setTimeout } = opts;
  const clearTimer =
    opts.clearTimer ?? ((handle: unknown) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]));
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimer(() => {
      const error = new DeadlineError(timeoutMs);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
    operation(controller.signal).then(
      value => {
        clearTimer(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimer(timer);
        reject(error);
      },
    );
  });
}
