import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CartItem } from './models';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly http = inject(HttpClient);

  items(): Observable<CartItem[]> {
    return this.http.get<CartItem[]>('/api/cart');
  }
}
