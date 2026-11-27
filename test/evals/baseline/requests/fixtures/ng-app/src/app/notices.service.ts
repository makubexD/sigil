import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Notice } from './models';

@Injectable({ providedIn: 'root' })
export class NoticesService {
  /** Notices as the server pushes them. The connection stays open for as long as someone listens. */
  stream(): Observable<Notice> {
    return new Observable<Notice>(subscriber => {
      const source = new EventSource('/api/notices');
      source.onmessage = event => subscriber.next(JSON.parse(event.data) as Notice);
      source.onerror = () => subscriber.error(new Error('the notice stream closed'));
      return () => source.close();
    });
  }
}
