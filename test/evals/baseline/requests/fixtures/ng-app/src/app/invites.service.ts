import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class InvitesService {
  private readonly http = inject(HttpClient);

  /** Registers a code so that whoever types it joins the team. */
  register(code: string): Observable<void> {
    return this.http.post<void>('/api/invites', { code });
  }
}
