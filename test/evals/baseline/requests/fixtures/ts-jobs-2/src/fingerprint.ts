import { createHash } from 'node:crypto';

/** One round: the SHA-256 of the input, as hex. */
export function round(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
