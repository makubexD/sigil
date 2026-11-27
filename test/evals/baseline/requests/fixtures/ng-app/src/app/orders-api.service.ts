import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OrderRow } from './models';

@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private readonly http = inject(HttpClient);

  /** Writes one order to the warehouse system; rejects when the warehouse refuses it. */
  save(row: OrderRow): Promise<void> {
    return firstValueFrom(this.http.post<void>('/api/warehouse/orders', row));
  }
}
