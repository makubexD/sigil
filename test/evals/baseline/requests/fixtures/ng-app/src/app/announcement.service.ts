import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface Announcement {
  /** Written by an admin in the CMS editor: text, bold, links and videos from videos.example.com. */
  html: string;
}

@Injectable({ providedIn: 'root' })
export class AnnouncementService {
  private readonly http = inject(HttpClient);

  current(): Observable<Announcement> {
    return this.http.get<Announcement>('/api/announcement');
  }
}
