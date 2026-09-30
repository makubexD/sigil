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
import { deepEqual, pruneEmpty } from './primitives';

export function reverseMerge(
  existing: Record<string, unknown>,
  op: ConfigMergeOp,
): Record<string, unknown> {
  let result = { ...existing };

  for (const [topKey, contributed] of Object.entries(op.fragment)) {
    if (!(topKey in result)) continue;
    const strat: MergeStrategy = op.strategy[topKey] ?? 'object-spread';
    const current = result[topKey];

    switch (strat) {
      case 'array-union':
      case 'array-append': {
        if (Array.isArray(contributed)) {
          // Flat array: filter items contributed by sigil
          if (Array.isArray(current)) {
            result[topKey] = (current as unknown[]).filter(
              item => !(contributed as unknown[]).some(c => deepEqual(c, item)),
            );
          }
        } else if (
          contributed !== null &&
          typeof contributed === 'object' &&
          current !== null &&
          typeof current === 'object' &&
          !Array.isArray(current)
        ) {
          // Object (either hooks event-map or permissions sub-arrays):
          // remove matching elements from each sub-array
          const contributedObj = contributed as Record<string, unknown>;
          const currentObj = current as Record<string, unknown>;
          const cleaned: Record<string, unknown> = { ...currentObj };
          for (const [subKey, subContrib] of Object.entries(contributedObj)) {
            if (Array.isArray(subContrib) && Array.isArray(cleaned[subKey])) {
              cleaned[subKey] = (cleaned[subKey] as unknown[]).filter(
                item => !(subContrib as unknown[]).some(c => deepEqual(c, item)),
              );
            } else if (!Array.isArray(subContrib)) {
              // Non-array sub-values (rare): remove if equal to contributed
              if (deepEqual(cleaned[subKey], subContrib)) {
                delete cleaned[subKey];
              }
            }
          }
          result[topKey] = cleaned;
        }
        break;
      }

      default: {
        // object-spread: remove leaves contributed by sigil if unchanged
        if (
          contributed !== null &&
          typeof contributed === 'object' &&
          !Array.isArray(contributed) &&
          current !== null &&
          typeof current === 'object' &&
          !Array.isArray(current)
        ) {
          result[topKey] = removeContributed(
            current as Record<string, unknown>,
            contributed as Record<string, unknown>,
          );
        } else {
          // Scalar: remove only if still equal to what sigil installed
          if (deepEqual(current, contributed)) {
            const { [topKey]: _removed, ...rest } = result;
            result = rest;
          }
          // else: user modified it — leave alone
        }
        break;
      }
    }
  }

  return pruneEmpty(result);
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
    if (!(k in result)) continue;
    const currentVal = result[k];

    if (
      contributedVal !== null &&
      typeof contributedVal === 'object' &&
      !Array.isArray(contributedVal) &&
      currentVal !== null &&
      typeof currentVal === 'object' &&
      !Array.isArray(currentVal)
    ) {
      result[k] = removeContributed(
        currentVal as Record<string, unknown>,
        contributedVal as Record<string, unknown>,
      );
    } else if (deepEqual(currentVal, contributedVal)) {
      const { [k]: _removed, ...rest } = result as Record<string, unknown>;
      return removeContributed(
        Object.assign({}, { ...current, ...rest }, { [k]: undefined }),
        contributed,
      );
    }
    // else: user modified — leave alone
  }
  // Clean up undefined values
  return Object.fromEntries(Object.entries(result).filter(([, v]) => v !== undefined));
}
