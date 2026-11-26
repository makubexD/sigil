/** 1234.5 becomes "1,234.50". */
export function formatAmount(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
