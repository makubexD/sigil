/**
 * detectConfigDrift — check whether sigil's installed fragment is still intact in the live JSON.
 *
 * Returns true (drifted) if ANY leaf value sigil contributed is now missing or changed.
 * Does NOT consider user-added keys as drift — we only check sigil's own keys.
 *
 * Uses the recorded fragment (as-installed) rather than the current catalog fragment,
 * so drift means "user changed what sigil put there", not "catalog was updated".
 */

import type { ConfigMergeOp, MergeStrategy } from '../types';
import { deepEqual } from './primitives';

/** True when `value` is a plain (non-array, non-null) object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** True when any item of `contributed` is missing from `current` (per deepEqual membership). */
function arrayMissingItems(current: unknown[], contributed: unknown[]): boolean {
  return contributed.some(item => !current.some(x => deepEqual(x, item)));
}

/** Drift check for `array-union`/`array-append`: flat array, or object-of-arrays. */
function arrayStrategyDrifted(current: unknown, contributed: unknown): boolean {
  if (Array.isArray(contributed)) {
    // All contributed items must still be present in the live flat array
    if (!Array.isArray(current)) return true;
    return arrayMissingItems(current, contributed);
  }
  if (isPlainObject(contributed)) {
    // Object-of-arrays (hooks event-map or permissions sub-arrays):
    // each contributed sub-array's items must still be in the live sub-array
    if (!isPlainObject(current)) return true;
    for (const [subKey, subContrib] of Object.entries(contributed)) {
      if (!Array.isArray(subContrib)) continue;
      const liveArr = current[subKey];
      if (!Array.isArray(liveArr)) return true;
      if (arrayMissingItems(liveArr, subContrib)) return true;
    }
  }
  return false;
}

/** Drift check for `object-spread`: nested-leaf comparison, or scalar equality. */
function objectSpreadDrifted(current: unknown, contributed: unknown): boolean {
  if (isPlainObject(contributed)) {
    if (!isPlainObject(current)) return true;
    return leafDrift(current, contributed);
  }
  return !deepEqual(current, contributed);
}

export function detectConfigDrift(live: Record<string, unknown>, op: ConfigMergeOp): boolean {
  for (const [topKey, contributed] of Object.entries(op.fragment)) {
    const strat: MergeStrategy = op.strategy[topKey] ?? 'object-spread';
    const current = live[topKey];

    const drifted =
      strat === 'array-union' || strat === 'array-append'
        ? arrayStrategyDrifted(current, contributed)
        : objectSpreadDrifted(current, contributed);
    if (drifted) return true;
  }
  return false;
}

function leafDrift(live: Record<string, unknown>, contributed: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(contributed)) {
    if (!(k in live)) return true;
    if (isPlainObject(v)) {
      if (!isPlainObject(live[k])) return true;
      if (leafDrift(live[k], v)) return true;
    } else if (!deepEqual(live[k], v)) {
      return true;
    }
  }
  return false;
}
