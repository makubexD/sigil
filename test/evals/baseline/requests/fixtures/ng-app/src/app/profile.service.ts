import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Profile } from './models';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  /** Rejects when the API refuses the request. */
  load(): Promise<Profile> {
    return firstValueFrom(this.http.get<Profile>('/api/profile'));
  }
}
