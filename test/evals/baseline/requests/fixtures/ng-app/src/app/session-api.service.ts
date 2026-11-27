import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Session, User } from './models';

@Injectable({ providedIn: 'root' })
export class SessionApi {
  private readonly http = inject(HttpClient);

  /** Signs the user in. The server also sets the session cookie, which `me` answers from. */
  signIn(email: string, password: string): Observable<Session> {
    return this.http.post<Session>('/api/session', { email, password });
  }

  signOut(): Observable<void> {
    return this.http.delete<void>('/api/session');
  }

  /** The signed-in user, from the session cookie. Answers 401 when nobody is signed in. */
  me(): Observable<User> {
    return this.http.get<User>('/api/me');
  }
}
