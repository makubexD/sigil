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

export function detectConfigDrift(live: Record<string, unknown>, op: ConfigMergeOp): boolean {
  for (const [topKey, contributed] of Object.entries(op.fragment)) {
    const strat: MergeStrategy = op.strategy[topKey] ?? 'object-spread';
    const current = live[topKey];

    switch (strat) {
      case 'array-union':
      case 'array-append': {
        if (Array.isArray(contributed)) {
          // All contributed items must still be present in the live flat array
          if (!Array.isArray(current)) return true;
          for (const item of contributed as unknown[]) {
            if (!(current as unknown[]).some(x => deepEqual(x, item))) return true;
          }
        } else if (contributed !== null && typeof contributed === 'object') {
          // Object-of-arrays (hooks event-map or permissions sub-arrays):
          // each contributed sub-array's items must still be in the live sub-array
          if (current === null || typeof current !== 'object' || Array.isArray(current))
            return true;
          const liveObj = current as Record<string, unknown>;
          for (const [subKey, subContrib] of Object.entries(
            contributed as Record<string, unknown>,
          )) {
            if (Array.isArray(subContrib)) {
              const liveArr = liveObj[subKey];
              if (!Array.isArray(liveArr)) return true;
              for (const item of subContrib as unknown[]) {
                if (!(liveArr as unknown[]).some(x => deepEqual(x, item))) return true;
              }
            }
          }
        }
        break;
      }

      default: {
        // object-spread: check all leaves sigil contributed are still equal
        if (
          contributed !== null &&
          typeof contributed === 'object' &&
          !Array.isArray(contributed)
        ) {
          if (current === null || typeof current !== 'object' || Array.isArray(current))
            return true;
          if (leafDrift(current as Record<string, unknown>, contributed as Record<string, unknown>))
            return true;
        } else {
          if (!deepEqual(current, contributed)) return true;
        }
        break;
      }
    }
  }
  return false;
}

function leafDrift(live: Record<string, unknown>, contributed: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(contributed)) {
    if (!(k in live)) return true;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      if (live[k] === null || typeof live[k] !== 'object' || Array.isArray(live[k])) return true;
      if (leafDrift(live[k] as Record<string, unknown>, v as Record<string, unknown>)) return true;
    } else if (!deepEqual(live[k], v)) {
      return true;
    }
  }
  return false;
}
