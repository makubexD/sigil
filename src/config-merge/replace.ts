/**
 * replaceMerge — swap a fragment sigil installed earlier for a new one, in one step: reverse
 * the previous fragment (removing only what is still exactly as sigil wrote it), then merge the
 * new one. Without this, a hook (`array-append`) re-installed by `sigil add`, or changed in the
 * catalog and re-applied by `sigil update`, stacked a second copy beside the first — so a fixed
 * hook ran next to the broken one it replaced (2026-09-27 install audit). A value the user edited
 * no longer equals the previous fragment, so reverseMerge leaves it in place.
 */
import { applyMerge } from './apply';
import { reverseMerge } from './reverse';
import type { ConfigMergeOp } from './primitives';

export function replaceMerge(
  existing: Record<string, unknown>,
  previous: ConfigMergeOp | undefined,
  next: ConfigMergeOp,
): Record<string, unknown> {
  const withoutPrevious = previous ? reverseMerge(existing, previous) : existing;
  return applyMerge(withoutPrevious, next);
}
