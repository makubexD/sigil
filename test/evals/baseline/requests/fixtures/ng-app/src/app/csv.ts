import { Row } from './models';

export class ImportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ImportError';
  }
}

/** Parses one `sku,price` line. Throws a `SyntaxError` that says what is wrong with it. */
export function parseRow(line: string): Row {
  const [sku, price, ...rest] = line.split(',');
  if (!sku || price === undefined || rest.length > 0)
    throw new SyntaxError(`expected sku,price but got "${line}"`);
  const amount = Number(price);
  if (price.trim() === '' || Number.isNaN(amount))
    throw new SyntaxError(`"${price}" is not a price`);
  return { sku: sku.trim(), price: amount };
}
