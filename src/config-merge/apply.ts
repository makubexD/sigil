/**
 * applyMerge — merge sigil's fragment into an existing JSON object.
 *
 * Supports three strategies (per top-level key, declared in the op):
 *   object-spread — deep-merge; incoming wins per leaf (default)
 *   array-union   — union-dedup; used for permissions allow/deny/ask
 *   array-append  — concatenate without dedup; used for hook event arrays
 *
 * Returns a new object — does not mutate `existing`.
 */

import type { ConfigMergeOp, MergeStrategy } from '../types';
import { deepEqual, deepMerge } from './primitives';

/** True when `value` is a plain (non-array, non-null) object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Dedup-union `incomingArr` onto `currentArr`, using deepEqual for membership. */
function unionArrays(currentArr: unknown[], incomingArr: unknown[]): unknown[] {
  const union = [...currentArr];
  for (const item of incomingArr) {
    if (!union.some(x => deepEqual(x, item))) union.push(item);
  }
  return union;
}

/** `array-union` strategy: flat array union, or per-subkey union for an object-of-arrays. */
function applyArrayUnionStrategy(current: unknown, incoming: unknown): unknown {
  if (Array.isArray(incoming)) {
    // Flat array union (e.g. top-level allow list)
    const currentArr = Array.isArray(current) ? (current as unknown[]) : [];
    return unionArrays(currentArr, incoming as unknown[]);
  }
  if (isPlainObject(incoming)) {
    // Object-of-arrays union (e.g. permissions: { allow, deny, ask })
    const currentObj = isPlainObject(current) ? current : {};
    const merged: Record<string, unknown> = { ...currentObj };
    for (const [subKey, subIncoming] of Object.entries(incoming)) {
      if (Array.isArray(subIncoming)) {
        const subCurrent = Array.isArray(merged[subKey]) ? (merged[subKey] as unknown[]) : [];
        merged[subKey] = unionArrays(subCurrent, subIncoming as unknown[]);
      } else {
        merged[subKey] = subIncoming;
      }
    }
    return merged;
  }
  return undefined;
}

/** `object-spread` strategy (also the array-append fallback): deep-merge objects, else replace. */
function applyObjectSpreadStrategy(current: unknown, incoming: unknown): unknown {
  if (isPlainObject(incoming) && isPlainObject(current)) {
    return deepMerge(current, incoming);
  }
  return incoming;
}

/**
 * `array-append` strategy: `incoming` is an object keyed by event name whose values are
 * arrays. Append per event key; don't replace same-event entries.
 */
function applyArrayAppendStrategy(current: unknown, incoming: unknown): unknown {
  if (!isPlainObject(incoming) || !isPlainObject(current)) {
    return applyObjectSpreadStrategy(current, incoming);
  }
  const mergedObj: Record<string, unknown> = { ...current };
  for (const [eventKey, eventItems] of Object.entries(incoming)) {
    const existingItems = Array.isArray(mergedObj[eventKey])
      ? (mergedObj[eventKey] as unknown[])
      : [];
    mergedObj[eventKey] = [
      ...existingItems,
      ...(Array.isArray(eventItems) ? eventItems : [eventItems]),
    ];
  }
  return mergedObj;
}

export function applyMerge(
  existing: Record<string, unknown>,
  op: ConfigMergeOp,
): Record<string, unknown> {
  const result = { ...existing };

  for (const [topKey, incoming] of Object.entries(op.fragment)) {
    const strat: MergeStrategy = op.strategy[topKey] ?? 'object-spread';
    const current = result[topKey];

    if (strat === 'array-union') {
      // Original behavior: when incoming is neither array nor object, leave result[topKey]
      // untouched (the switch's array-union case had no matching branch, so no assignment ran).
      if (Array.isArray(incoming) || isPlainObject(incoming)) {
        result[topKey] = applyArrayUnionStrategy(current, incoming);
      }
    } else if (strat === 'array-append') {
      result[topKey] = applyArrayAppendStrategy(current, incoming);
    } else {
      result[topKey] = applyObjectSpreadStrategy(current, incoming);
    }
  }

  return result;
}
