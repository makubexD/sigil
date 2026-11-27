import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OrderRow, Receipt } from './models';

@Injectable({ providedIn: 'root' })
export class GatewayService {
  private readonly http = inject(HttpClient);

  /** Charges the order; rejects when the payment gateway declines or cannot be reached. */
  charge(order: OrderRow): Promise<Receipt> {
    return firstValueFrom(this.http.post<Receipt>('/api/gateway/charges', order));
  }
}
