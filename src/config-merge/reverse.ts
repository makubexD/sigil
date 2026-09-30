/**
 * reverseMerge — remove sigil's contribution from a live JSON object.
 *
 * - object-spread keys: removed only when the live value still equals what sigil installed.
 *   If the user modified it, the key is left intact.
 * - array-union / array-append: elements that deep-equal the installed fragment are filtered out.
 *
 * After removal, pruneEmpty collapses now-empty containers.
 * If the returned object is `{}`, the caller should delete the file.
 */

import type { ConfigMergeOp, MergeStrategy } from '../types';
import { deepEqual, pruneEmpty, isPlainObject, FORBIDDEN_KEYS } from './primitives';

/** Filters `items` that deep-equal to remove out of `arr`. */
function removeDeepEqualItems(arr: unknown[], items: unknown[]): unknown[] {
  return arr.filter(item => !items.some(c => deepEqual(c, item)));
}

/** Removes sigil-contributed elements from each sub-array/sub-value of an object-of-arrays. */
function removeContributedSubArrays(
  current: Record<string, unknown>,
  contributed: Record<string, unknown>,
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = { ...current };
  for (const [subKey, subContrib] of Object.entries(contributed)) {
    if (FORBIDDEN_KEYS.has(subKey)) continue; // prototype-pollution guard
    if (Array.isArray(subContrib) && Array.isArray(cleaned[subKey])) {
      cleaned[subKey] = removeDeepEqualItems(cleaned[subKey] as unknown[], subContrib);
    } else if (!Array.isArray(subContrib) && deepEqual(cleaned[subKey], subContrib)) {
      // Non-array sub-values (rare): remove if equal to contributed
      delete cleaned[subKey];
    }
  }
  return cleaned;
}

/** Reverses an `array-union` / `array-append` top-level key: filters out contributed elements. */
function reverseArrayStrategy(current: unknown, contributed: unknown): unknown {
  if (Array.isArray(contributed)) {
    // Flat array: filter items contributed by sigil
    return Array.isArray(current) ? removeDeepEqualItems(current, contributed) : current;
  }

  if (isPlainObject(contributed) && isPlainObject(current)) {
    // Object (either hooks event-map or permissions sub-arrays)
    return removeContributedSubArrays(current, contributed);
  }

  return current;
}

/**
 * Reverses an `object-spread` top-level key. Returns the updated `result` object (a scalar
 * removal deletes the key entirely, so the whole object — not just the value — is returned).
 */
function reverseObjectSpreadStrategy(
  result: Record<string, unknown>,
  topKey: string,
  current: unknown,
  contributed: unknown,
): Record<string, unknown> {
  if (isPlainObject(contributed) && isPlainObject(current)) {
    return { ...result, [topKey]: removeContributed(current, contributed) };
  }
  // Scalar: remove only if still equal to what sigil installed
  if (deepEqual(current, contributed)) {
    const { [topKey]: _removed, ...rest } = result;
    return rest;
  }
  // else: user modified it — leave alone
  return result;
}

export function reverseMerge(
  existing: Record<string, unknown>,
  op: ConfigMergeOp,
): Record<string, unknown> {
  let result = { ...existing };

  for (const [topKey, contributed] of Object.entries(op.fragment)) {
    if (FORBIDDEN_KEYS.has(topKey)) continue; // prototype-pollution guard
    if (!(topKey in result)) continue;
    const strat: MergeStrategy = op.strategy[topKey] ?? 'object-spread';
    const current = result[topKey];

    if (strat === 'array-union' || strat === 'array-append') {
      result[topKey] = reverseArrayStrategy(current, contributed);
    } else {
      result = reverseObjectSpreadStrategy(result, topKey, current, contributed);
    }
  }

  return pruneEmpty(result);
}

/** Rebuilds `current` with key `k` marked for removal, preserving `rest`'s prior edits. */
function mergeWithRemovedKey(
  current: Record<string, unknown>,
  rest: Record<string, unknown>,
  k: string,
): Record<string, unknown> {
  return Object.assign({}, { ...current, ...rest }, { [k]: undefined });
}

/** Drops entries whose value is `undefined` (the removal marker used by removeContributed). */
function pruneUndefinedEntries(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/**
 * Recursively remove leaves from `current` that sigil contributed and are still unchanged.
 */
function removeContributed(
  current: Record<string, unknown>,
  contributed: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...current };
  for (const [k, contributedVal] of Object.entries(contributed)) {
    if (FORBIDDEN_KEYS.has(k)) continue; // prototype-pollution guard
    if (!(k in result)) continue;
    const currentVal = result[k];

    if (isPlainObject(contributedVal) && isPlainObject(currentVal)) {
      result[k] = removeContributed(currentVal, contributedVal);
    } else if (deepEqual(currentVal, contributedVal)) {
      const { [k]: _removed, ...rest } = result;
      return removeContributed(mergeWithRemovedKey(current, rest, k), contributed);
    }
    // else: user modified — leave alone
  }
  return pruneUndefinedEntries(result);
}
