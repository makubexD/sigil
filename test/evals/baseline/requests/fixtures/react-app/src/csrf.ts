/**
 * The CSRF token the server put in the page for this session. The API refuses a request that changes
 * data unless it carries the token in an `X-CSRF-Token` header.
 */
export function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}
