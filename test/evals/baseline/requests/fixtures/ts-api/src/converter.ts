import { join } from 'node:path';

/** The converter the ops team ships with the service. */
export const CONVERTER = join(process.cwd(), 'scripts', 'convert.mjs');

/** File types the converter accepts. */
export const CONVERTIBLE = ['.txt', '.md', '.csv'];
