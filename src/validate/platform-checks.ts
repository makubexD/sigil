/**
 * §5: each `platforms:` entry must be a registered target that supports this artifact's kind.
 */
import type { Artifact } from '../types';
import type { ValidateCtx } from './types';
import { KIND_REGISTRY } from '../kinds';
import { supportsKind } from '../targets/capabilities';

interface PlatformNameSets {
  readonly allTargetNames: Set<string>;
  readonly kindSupporting: Set<string>;
}

/** Checks one `platforms:` entry against the known/kind-supporting target sets. */
function checkOnePlatformName(
  ctx: ValidateCtx,
  artifact: Artifact,
  p: string,
  sets: PlatformNameSets,
): void {
  if (!sets.allTargetNames.has(p)) {
    ctx.errors.push({
      artifactId: artifact.id,
      filePath: artifact.filePath,
      error: `platforms: '${p}' is not a registered target. Known: ${[...sets.allTargetNames].join(', ')}`,
    });
  } else if (!sets.kindSupporting.has(p)) {
    ctx.warnings.push(
      `[${artifact.id}] platforms: '${p}' does not support kind '${artifact.kind}' — this platform will never emit this artifact`,
    );
  }
}

export function checkPlatforms(ctx: ValidateCtx, artifact: Artifact): void {
  if (!ctx.knownTargets || ctx.knownTargets.length === 0) return;
  const platforms = artifact.frontmatter.platforms as string[] | undefined;
  if (!platforms || platforms.length === 0) return;

  const sets: PlatformNameSets = {
    allTargetNames: new Set(ctx.knownTargets.map(t => t.name)),
    kindSupporting: new Set(
      ctx.knownTargets.filter(t => supportsKind(t, artifact.kind)).map(t => t.name),
    ),
  };
  for (const p of platforms) {
    checkOnePlatformName(ctx, artifact, p, sets);
  }
}

/**
 * §8 (catalog-wide, warning): a kind whose KIND_REGISTRY.ownedBy names exactly one target may
 * legitimately model that target's vocabulary directly in its neutral schema (there is nothing
 * to keep neutral yet — see kinds.ts). The moment a SECOND registered target declares
 * support for that kind (its capability table), the assumption breaks: the kind's shape needs to move
 * behind Target.frontmatterExtensions namespaces before two providers' vocabularies collide in
 * one neutral schema. This is the tripwire that catches that moment instead of leaving it to be
 * discovered as a bug in a third provider's adapter.
 */
const MIN_TARGETS_FOR_OWNERSHIP_CONFLICT = 2;

export function checkOwnedByKindConflicts(ctx: ValidateCtx): void {
  if (!ctx.knownTargets || ctx.knownTargets.length < MIN_TARGETS_FOR_OWNERSHIP_CONFLICT) return;

  for (const descriptor of Object.values(KIND_REGISTRY)) {
    if (descriptor.ownedBy.length === 0) continue;
    const supporters = ctx.knownTargets
      .filter(t => supportsKind(t, descriptor.kind))
      .map(t => t.name);
    const uninvited = supporters.filter(name => !descriptor.ownedBy.includes(name));
    if (uninvited.length > 0) {
      ctx.warnings.push(
        `Kind '${descriptor.kind}' is modeled as ${descriptor.ownedBy.join('/')}'s native vocabulary ` +
          `(KIND_REGISTRY.ownedBy) but ${uninvited.join(', ')} also declares support for it — ` +
          `move '${descriptor.kind}'-specific fields behind Target.frontmatterExtensions before ` +
          `these providers' shapes collide in one neutral schema.`,
      );
    }
  }
}
