import { reportError } from './reporter';

export class HttpError extends Error {
  constructor(
    readonly endpoint: string,
    readonly status: number,
  ) {
    super(`${endpoint} answered ${status}`);
    this.name = 'HttpError';
  }
}

/**
 * Every API call goes through here. A call the server refuses is reported once, with its endpoint and
 * status, and then thrown as an `HttpError`.
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...init });
  if (!response.ok) {
    const error = new HttpError(path, response.status);
    reportError(error, { endpoint: path, status: response.status });
    throw error;
  }
  return (await response.json()) as T;
}
