import { Injectable, signal } from '@angular/core';
import { Price } from './models';

@Injectable({ providedIn: 'root' })
export class PricesService {
  /** The price list on screen. It changes when the user edits a line. */
  readonly prices = signal<Price[]>([]);
}
