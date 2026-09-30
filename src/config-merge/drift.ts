/**
 * classifyConfigDrift / detectConfigDrift — check whether sigil's installed fragment is still
 * intact in the live JSON, and — critically — *why* it isn't when it's not.
 *
 * `missing` (sigil's fragment is entirely absent) and `modified` (the user changed a value sigil
 * contributed) look identical as a boolean but call for opposite repair behaviour: restoring a
 * missing fragment is purely additive and can never clobber a user edit, so it is safe to do
 * without confirmation; restoring a modified one overwrites something the user deliberately
 * changed, so it must stay behind `--force`. See docs/decisions/catalog-usage-audit-2026-08-21.md
 * F14 — this distinction did not exist before, and its absence meant `sigil update` silently
 * declined to repair a config fragment a completely unrelated process had deleted.
 *
 * Uses the recorded fragment (as-installed) rather than the current catalog fragment,
 * so drift means "user changed what sigil put there", not "catalog was updated".
 */

import type { ConfigMergeOp, MergeStrategy } from '../types';
import { deepEqual, isPlainObject, FORBIDDEN_KEYS } from './primitives';

export type DriftClass = 'intact' | 'missing' | 'modified';

/**
 * Combines two per-key/per-leaf classifications into one for the fragment as a whole. A mix of
 * `missing` and `modified` across different top-level keys (or object-spread leaves) collapses to
 * `modified` — the fragment as a whole isn't safe to blindly re-merge without `--force`, since at
 * least one piece of it is a real overwrite risk, even if another piece is purely additive.
 */
function combine(a: DriftClass, b: DriftClass): DriftClass {
  if (a === b) return a;
  if (a === 'intact') return b;
  if (b === 'intact') return a;
  return 'modified';
}

function combineAll(classes: DriftClass[]): DriftClass {
  return classes.reduce(combine, 'intact');
}

/**
 * Per-item classification for `array-union`/`array-append`: each contributed item is present or
 * not. Both strategies are provably non-destructive to re-apply (union dedupes, append only
 * concatenates) — re-merging can never overwrite or remove anything already in the live array,
 * unlike `object-spread`'s leaf overwrite. So a missing item is always classified `missing`, even
 * when the array already holds unrelated (or superficially similar-but-different) content —
 * there is no way for these strategies to "clobber" that content by re-adding sigil's own item.
 */
function classifyArrayItems(current: unknown[] | undefined, contributed: unknown[]): DriftClass {
  if (!current) return contributed.length > 0 ? 'missing' : 'intact';
  const allPresent = contributed.every(item => current.some(x => deepEqual(x, item)));
  return allPresent ? 'intact' : 'missing';
}

/** Classifies an object-of-arrays contribution (e.g. `permissions: { allow, deny, ask }`). */
function classifyObjectOfArrays(
  current: Record<string, unknown>,
  contributed: Record<string, unknown>,
): DriftClass {
  const perSubKey: DriftClass[] = [];
  for (const [subKey, subContrib] of Object.entries(contributed)) {
    if (FORBIDDEN_KEYS.has(subKey)) continue; // prototype-pollution guard
    if (!Array.isArray(subContrib)) continue;
    const liveArr = current[subKey];
    perSubKey.push(classifyArrayItems(Array.isArray(liveArr) ? liveArr : undefined, subContrib));
  }
  return combineAll(perSubKey);
}

/** Drift classification for `array-union`/`array-append`: flat array, or object-of-arrays. */
function classifyArrayStrategy(current: unknown, contributed: unknown): DriftClass {
  if (Array.isArray(contributed)) {
    return classifyArrayItems(Array.isArray(current) ? current : undefined, contributed);
  }
  if (isPlainObject(contributed)) {
    if (current === undefined) return Object.keys(contributed).length > 0 ? 'missing' : 'intact';
    if (!isPlainObject(current)) return 'modified'; // key exists but with an incompatible shape (array strategy)
    return classifyObjectOfArrays(current, contributed);
  }
  return 'intact';
}

/** Drift classification for `object-spread`: nested-leaf comparison, or scalar equality. */
function classifyObjectSpread(current: unknown, contributed: unknown): DriftClass {
  if (isPlainObject(contributed)) {
    if (current === undefined) return Object.keys(contributed).length > 0 ? 'missing' : 'intact';
    if (!isPlainObject(current)) return 'modified'; // key exists but with an incompatible shape
    return classifyLeaves(current, contributed);
  }
  if (deepEqual(current, contributed)) return 'intact';
  return current === undefined ? 'missing' : 'modified';
}

function classifyLeaves(
  live: Record<string, unknown>,
  contributed: Record<string, unknown>,
): DriftClass {
  const perKey: DriftClass[] = [];
  for (const [k, v] of Object.entries(contributed)) {
    if (FORBIDDEN_KEYS.has(k)) continue; // prototype-pollution guard
    if (!(k in live)) {
      perKey.push(isPlainObject(v) && Object.keys(v).length === 0 ? 'intact' : 'missing');
    } else if (isPlainObject(v)) {
      perKey.push(isPlainObject(live[k]) ? classifyLeaves(live[k], v) : 'modified');
    } else {
      perKey.push(deepEqual(live[k], v) ? 'intact' : 'modified');
    }
  }
  return combineAll(perKey);
}

/**
 * Classifies how `op.fragment` compares to the live JSON: `intact` (nothing to do), `missing`
 * (sigil's fragment is wholly absent — safe to restore without `--force`), or `modified` (the
 * user changed a value sigil contributed — restoring would clobber that edit; needs `--force`).
 */
export function classifyConfigDrift(live: Record<string, unknown>, op: ConfigMergeOp): DriftClass {
  const perTopKey: DriftClass[] = [];
  for (const [topKey, contributed] of Object.entries(op.fragment)) {
    if (FORBIDDEN_KEYS.has(topKey)) continue; // prototype-pollution guard
    const strat: MergeStrategy = op.strategy[topKey] ?? 'object-spread';
    const current = live[topKey];
    perTopKey.push(
      strat === 'array-union' || strat === 'array-append'
        ? classifyArrayStrategy(current, contributed)
        : classifyObjectSpread(current, contributed),
    );
  }
  return combineAll(perTopKey);
}

/** True when sigil's fragment is not fully intact, regardless of why. Preserved for callers that only need a boolean. */
export function detectConfigDrift(live: Record<string, unknown>, op: ConfigMergeOp): boolean {
  return classifyConfigDrift(live, op) !== 'intact';
}
