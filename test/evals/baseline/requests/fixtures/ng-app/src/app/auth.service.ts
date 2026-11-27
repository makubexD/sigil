import { Injectable, signal } from '@angular/core';

/** Holds the access token for this page load. The server sends a fresh one with each sign-in. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly token = signal<string | null>(null);
}
