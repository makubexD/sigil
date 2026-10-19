import { differenceInCalendarDays } from 'date-fns';

export function formatPrice(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export function applyDiscount(cents: number, percent: number): number {
  if (percent < 0 || percent > 100) throw new RangeError(`discount out of range: ${percent}`);
  return Math.round(cents * (1 - percent / 100));
}

export function orderAgeDays(placedAt: Date, now: Date = new Date()): number {
  return differenceInCalendarDays(now, placedAt);
}
