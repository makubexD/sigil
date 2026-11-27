/** Sends the user to another page of the portal. The app shell listens for the event and routes. */
export function navigate(to: string): void {
  window.dispatchEvent(new CustomEvent('portal:navigate', { detail: to }));
}
