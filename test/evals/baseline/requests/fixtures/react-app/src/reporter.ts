/**
 * Sends an error to error tracking. Everyone in the company can search what is sent, and it is kept
 * for a year.
 */
export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  const body = JSON.stringify({
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    page: window.location.pathname,
    context,
  });
  navigator.sendBeacon('/errors', body);
}
