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

export function applyMerge(
  existing: Record<string, unknown>,
  op: ConfigMergeOp,
): Record<string, unknown> {
  const result = { ...existing };

  for (const [topKey, incoming] of Object.entries(op.fragment)) {
    const strat: MergeStrategy = op.strategy[topKey] ?? 'object-spread';
    const current = result[topKey];

    switch (strat) {
      case 'array-union': {
        if (Array.isArray(incoming)) {
          // Flat array union (e.g. top-level allow list)
          const currentArr = Array.isArray(current) ? (current as unknown[]) : [];
          const incomingArr = incoming as unknown[];
          const union = [...currentArr];
          for (const item of incomingArr) {
            if (!union.some(x => deepEqual(x, item))) union.push(item);
          }
          result[topKey] = union;
        } else if (incoming !== null && typeof incoming === 'object' && !Array.isArray(incoming)) {
          // Object-of-arrays union (e.g. permissions: { allow, deny, ask })
          const incomingObj = incoming as Record<string, unknown>;
          const currentObj =
            current !== null && typeof current === 'object' && !Array.isArray(current)
              ? (current as Record<string, unknown>)
              : {};
          const merged: Record<string, unknown> = { ...currentObj };
          for (const [subKey, subIncoming] of Object.entries(incomingObj)) {
            if (Array.isArray(subIncoming)) {
              const subCurrent = Array.isArray(merged[subKey]) ? (merged[subKey] as unknown[]) : [];
              const union = [...subCurrent];
              for (const item of subIncoming as unknown[]) {
                if (!union.some(x => deepEqual(x, item))) union.push(item);
              }
              merged[subKey] = union;
            } else {
              merged[subKey] = subIncoming;
            }
          }
          result[topKey] = merged;
        }
        break;
      }

      case 'array-append': {
        // For hook events: `incoming` is an object keyed by event name whose values are arrays.
        // Append per event key; don't replace same-event entries.
        if (
          incoming !== null &&
          typeof incoming === 'object' &&
          !Array.isArray(incoming) &&
          current !== null &&
          typeof current === 'object' &&
          !Array.isArray(current)
        ) {
          const currentObj = current as Record<string, unknown>;
          const incomingObj = incoming as Record<string, unknown>;
          const mergedObj: Record<string, unknown> = { ...currentObj };
          for (const [eventKey, eventItems] of Object.entries(incomingObj)) {
            const existing = Array.isArray(mergedObj[eventKey])
              ? (mergedObj[eventKey] as unknown[])
              : [];
            mergedObj[eventKey] = [
              ...existing,
              ...(Array.isArray(eventItems) ? eventItems : [eventItems]),
            ];
          }
          result[topKey] = mergedObj;
        } else {
          // Fallback: treat like object-spread
          if (
            incoming !== null &&
            typeof incoming === 'object' &&
            !Array.isArray(incoming) &&
            current !== null &&
            typeof current === 'object' &&
            !Array.isArray(current)
          ) {
            result[topKey] = deepMerge(
              current as Record<string, unknown>,
              incoming as Record<string, unknown>,
            );
          } else {
            result[topKey] = incoming;
          }
        }
        break;
      }

      default: {
        // object-spread
        if (
          incoming !== null &&
          typeof incoming === 'object' &&
          !Array.isArray(incoming) &&
          current !== null &&
          typeof current === 'object' &&
          !Array.isArray(current)
        ) {
          result[topKey] = deepMerge(
            current as Record<string, unknown>,
            incoming as Record<string, unknown>,
          );
        } else {
          result[topKey] = incoming;
        }
        break;
      }
    }
  }

  return result;
}
