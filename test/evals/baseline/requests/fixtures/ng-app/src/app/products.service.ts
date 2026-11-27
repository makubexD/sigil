import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Product } from './models';

@Injectable({ providedIn: 'root' })
export class ProductsService {
  private readonly http = inject(HttpClient);

  /** Products matching the term. A short term matches more and takes longer to answer. */
  find(term: string): Observable<Product[]> {
    return this.http.get<Product[]>('/api/products', { params: new HttpParams().set('q', term) });
  }
}
