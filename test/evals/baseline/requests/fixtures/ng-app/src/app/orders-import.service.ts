import { Injectable, inject } from '@angular/core';
import { OrderRow } from './models';
import { OrdersApi } from './orders-api.service';

@Injectable({ providedIn: 'root' })
export class OrdersImportService {
  private readonly api = inject(OrdersApi);

  isValid(row: OrderRow): boolean {
    const valid = row.id !== '' && row.total >= 0;
    if (!valid) console.log('invalid row', row);
    return valid;
  }
}
