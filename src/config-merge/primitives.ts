/**
 * Primitive utilities shared by all config-merge operations.
 *
 * deepEqual     — structural equality for any JSON-compatible value
 * deepMerge     — deep-merge objects (incoming wins per leaf; arrays replaced)
 * pruneEmpty    — recursively drop empty objects/arrays after a reverse-merge
 * canonicalize  — stable sorted JSON string for hashing
 * serialize     — order-preserving JSON string for disk writes
 */

import type { ConfigMergeOp, MergeStrategy } from '../types';

export type { ConfigMergeOp, MergeStrategy };

// ─── Deep equality ────────────────────────────────────────────────────────────

/**
 * Deep structural equality check.
 * Handles primitives, arrays, and plain objects.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, (b as unknown[])[i]));
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA).sort();
  const keysB = Object.keys(objB).sort();
  if (keysA.length !== keysB.length) return false;
  if (!keysA.every((k, i) => k === keysB[i])) return false;
  return keysA.every(k => deepEqual(objA[k], objB[k]));
}

// ─── Deep merge ───────────────────────────────────────────────────────────────

/**
 * Keys that, if present in external input, would mutate the prototype chain
 * of all plain objects in this process. Guard every merge/assign loop against these.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Deep-merge `incoming` into `base`, returning a new object.
 * Incoming wins per leaf for scalar + object values; arrays are replaced (not merged —
 * array merge strategies are handled at the top level by applyMerge).
 *
 * Prototype-pollution guard: keys in `FORBIDDEN_KEYS` are silently dropped so
 * a malicious catalog artifact cannot inject `__proto__` or `constructor` into
 * the process object graph (catalog content is treated as untrusted by the
 * trust scanner; this is the runtime counterpart of that policy).
 */
export function deepMerge(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const [k, v] of Object.entries(incoming)) {
    if (FORBIDDEN_KEYS.has(k)) continue; // prototype-pollution guard
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      typeof result[k] === 'object' &&
      result[k] !== null &&
      !Array.isArray(result[k])
    ) {
      result[k] = deepMerge(result[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ─── Prune empty containers ───────────────────────────────────────────────────

/**
 * Recursively remove keys whose value is an empty object or empty array.
 * Used after reverseMerge so we don't leave `{ hooks: {} }` behind.
 */
export function pruneEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_KEYS.has(k)) continue; // prototype-pollution guard
    if (Array.isArray(v)) {
      if (v.length > 0) result[k] = v;
    } else if (v !== null && typeof v === 'object') {
      const pruned = pruneEmpty(v as Record<string, unknown>);
      if (Object.keys(pruned).length > 0) result[k] = pruned;
    } else if (v !== undefined) {
      result[k] = v;
    }
  }
  return result;
}

// ─── Stable serialisation ─────────────────────────────────────────────────────

/**
 * Return a stable JSON string with **sorted** keys (2-space indent, trailing newline).
 * Used to produce a deterministic hash for drift detection and manifest recording.
 * Do NOT use on the disk-write path — use `serialize()` there to preserve key order.
 */
export function canonicalize(obj: Record<string, unknown>): string {
  return JSON.stringify(sortKeys(obj), null, 2) + '\n';
}

/**
 * Return an order-preserving JSON string (2-space indent, trailing newline).
 * Used on the disk-write path so a backup-vs-new diff shows only the keys sigil
 * added — existing keys keep their original order and position in the file.
 */
export function serialize(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, null, 2) + '\n';
}

function sortKeys(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(sortKeys);
  if (val !== null && typeof val === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(val as Record<string, unknown>).sort()) {
      sorted[k] = sortKeys((val as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return val;
}
