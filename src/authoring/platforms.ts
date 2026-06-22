/**
 * Platform-set math utilities for the `platforms:` frontmatter field lifecycle.
 *
 * Core DRY rule: when an artifact's platform set equals "every target that supports
 * its kind", the `platforms:` field should be absent (not listed explicitly). This
 * module enforces that normalization and provides add/remove/set helpers.
 */
import type { Target, ArtifactKind } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns every registered target whose supportedKinds includes the given kind.
 * Targets that declare no supportedKinds are treated as supporting everything.
 */
export function kindSupportingTargets(kind: string, targets: Target[]): Target[] {
  return targets.filter(t =>
    !t.supportedKinds || t.supportedKinds.includes(kind as ArtifactKind),
  );
}

/**
 * Returns the effective set of target names for this artifact.
 * When `platforms` is absent/empty → all kind-supporting targets (DRY default).
 * When `platforms` is present → the specified subset (still intersected with kind-supporting).
 */
export function effectivePlatforms(
  kind: string,
  platforms: string[] | undefined,
  targets: Target[],
): string[] {
  const supporting = kindSupportingTargets(kind, targets).map(t => t.name);
  if (!platforms || platforms.length === 0) return supporting;
  // Intersect with kind-supporting targets (silently drop unsupported ones; validate warns)
  return platforms.filter(p => supporting.includes(p));
}

/**
 * Returns true when the platform set equals all kind-supporting targets —
 * the normalization condition under which the `platforms:` field should be removed.
 */
export function isFullCoverage(
  kind: string,
  platformSet: string[],
  targets: Target[],
): boolean {
  const supporting = kindSupportingTargets(kind, targets).map(t => t.name);
  if (supporting.length === 0) return true; // no targets support it → vacuously full
  const setNames = new Set(platformSet);
  return supporting.every(n => setNames.has(n)) && platformSet.length === supporting.length;
}

/**
 * Returns the normalized `platforms` field value to write into frontmatter:
 * - `undefined` when the set equals all kind-supporting targets (field should be removed).
 * - Sorted string array otherwise.
 */
export function normalizePlatforms(
  kind: string,
  platformSet: string[],
  targets: Target[],
): string[] | undefined {
  const sorted = [...platformSet].sort();
  return isFullCoverage(kind, sorted, targets) ? undefined : sorted;
}

// ─── Mutation helpers ─────────────────────────────────────────────────────────

export interface PlatformMutationResult {
  /** Normalized platforms field value (undefined = field should be removed). */
  platforms: string[] | undefined;
  /** True when the operation produced no change to the effective set. */
  noOp: boolean;
  /** Validation errors that must prevent the mutation. */
  errors: string[];
  /** Advisory warnings (e.g. platform added that was already covered). */
  warnings: string[];
}

/**
 * Add platforms to the current set and normalize.
 * Validates each name exists in the registry and supports the kind.
 */
export function addPlatforms(
  kind: string,
  current: string[] | undefined,
  toAdd: string[],
  targets: Target[],
): PlatformMutationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const allNames = new Set(targets.map(t => t.name));
  const supporting = new Set(kindSupportingTargets(kind, targets).map(t => t.name));
  const currentSet = new Set(effectivePlatforms(kind, current, targets));

  for (const p of toAdd) {
    if (!allNames.has(p)) {
      errors.push(`Unknown platform '${p}'. Known platforms: ${[...allNames].join(', ')}`);
    } else if (!supporting.has(p)) {
      errors.push(`Platform '${p}' does not support kind '${kind}'`);
    }
  }
  if (errors.length > 0) return { platforms: current ? [...current].sort() : undefined, noOp: true, errors, warnings };

  const alreadyCovered = toAdd.filter(p => currentSet.has(p));
  if (alreadyCovered.length > 0) {
    warnings.push(`Already targeted: ${alreadyCovered.join(', ')}`);
  }

  if (alreadyCovered.length === toAdd.length) {
    return { platforms: normalizePlatforms(kind, [...currentSet], targets), noOp: true, errors, warnings };
  }

  const newSet = new Set([...currentSet, ...toAdd]);
  const normalized = normalizePlatforms(kind, [...newSet], targets);
  return { platforms: normalized, noOp: false, errors, warnings };
}

/**
 * Remove platforms from the current set and normalize.
 * Errors if the result would be empty (artifact targeting no platforms).
 */
export function removePlatforms(
  kind: string,
  current: string[] | undefined,
  toRemove: string[],
  targets: Target[],
): PlatformMutationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const currentSet = new Set(effectivePlatforms(kind, current, targets));
  const notPresent = toRemove.filter(p => !currentSet.has(p));
  if (notPresent.length > 0) {
    warnings.push(`Not currently targeted (no-op for these): ${notPresent.join(', ')}`);
  }

  if (notPresent.length === toRemove.length) {
    return { platforms: normalizePlatforms(kind, [...currentSet], targets), noOp: true, errors, warnings };
  }

  const remaining = [...currentSet].filter(p => !toRemove.includes(p));
  if (remaining.length === 0) {
    errors.push('Cannot remove all platforms — artifact would target no platform. Use retarget --to <name> to change targets instead.');
    return { platforms: normalizePlatforms(kind, [...currentSet], targets), noOp: true, errors, warnings };
  }

  const normalized = normalizePlatforms(kind, remaining, targets);
  return { platforms: normalized, noOp: false, errors, warnings };
}

/**
 * Set the platform list to an absolute value and normalize.
 * Pass `undefined` or `[]` to reset to all (DRY default).
 */
export function setPlatforms(
  kind: string,
  toSet: string[] | undefined,
  targets: Target[],
): PlatformMutationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!toSet || toSet.length === 0) {
    // Reset to all-supporting (remove the field)
    return { platforms: undefined, noOp: false, errors, warnings };
  }

  const allNames = new Set(targets.map(t => t.name));
  const supporting = new Set(kindSupportingTargets(kind, targets).map(t => t.name));

  for (const p of toSet) {
    if (!allNames.has(p)) {
      errors.push(`Unknown platform '${p}'. Known platforms: ${[...allNames].join(', ')}`);
    } else if (!supporting.has(p)) {
      errors.push(`Platform '${p}' does not support kind '${kind}'`);
    }
  }
  if (errors.length > 0) return { platforms: undefined, noOp: true, errors, warnings };

  const normalized = normalizePlatforms(kind, toSet, targets);
  return { platforms: normalized, noOp: false, errors, warnings };
}
