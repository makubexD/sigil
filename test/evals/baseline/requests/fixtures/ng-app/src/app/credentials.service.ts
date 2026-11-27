import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface LoginRequest {
  email: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class CredentialsService {
  private readonly http = inject(HttpClient);

  /** The access token when the credentials are right, `null` when they are not. */
  check(request: LoginRequest): Promise<string | null> {
    return firstValueFrom(
      this.http.post<{ token: string | null }>('/api/credentials', request),
    ).then(answer => answer.token);
  }
}
