/**
 * `hook-target-render` — a catalog `hook` that ships to a target (`platforms:` absent or naming
 * it) must actually render there. A target that delivers `hook` natively declares the hooks it
 * cannot render through `Target.configSkipReason` (Cursor today: an event or matcher its Claude
 * Code alias table has no entry for, or a command line PowerShell would break). `add` and the
 * wizard then skip that hook with the reason, but at release time nothing else notices the
 * mismatch — the catalog hook simply never installs on one target while every other target and
 * the catalog source look fine.
 *
 * A non-undefined reason is an error here: the author either adds `platforms:` without this
 * target, or changes the hook's event/matcher so it can be rendered. No `fix()`: which of the two
 * the hook should do is a catalog decision, not a safe unattended rewrite.
 *
 * @module
 */
import type { Artifact, ResolvedArtifact, Target } from '../../../../types';
import type { ConformanceContext, ConformanceFinding, ConformanceRule } from '../types';
import { nativeKinds } from '../../../../targets/capabilities';
import { artifactTargetsPlatform } from '../../../../select/selection';

/** Targets that declare a hook renderer, i.e. install hooks natively and can refuse some. */
function hookRenderer(target: Target): Target['configSkipReason'] {
  if (!nativeKinds(target, 'scaffold').includes('hook')) return undefined;
  return target.configSkipReason;
}

/** The finding's detail: the hook, the target, the reason, and the two ways to fix it. */
function detailFor(
  artifact: Artifact,
  target: Target,
  reason: string,
  targets: readonly Target[],
): string {
  const others = targets.map(t => t.name).filter(name => name !== target.name);
  return (
    `hook '${artifact.id}' ships to target '${target.name}', but '${target.name}' cannot ` +
    `render it: ${reason} Fix: add \`platforms: [${others.join(', ')}]\` (every registered ` +
    `target except '${target.name}'), or change the hook's event/matcher so it can render.`
  );
}

/** The finding for one (hook, target) pair, or undefined when it renders or is not shipped there. */
function findingFor(
  artifact: Artifact,
  target: Target,
  skipReason: NonNullable<Target['configSkipReason']>,
  targets: readonly Target[],
): ConformanceFinding | undefined {
  if (!artifactTargetsPlatform(artifact, target.name)) return undefined;
  const reason = skipReason(artifact as ResolvedArtifact);
  if (reason === undefined) return undefined;
  return {
    ruleId: 'hook-target-render',
    severity: 'error',
    artifactId: artifact.id,
    provider: target.name,
    detail: detailFor(artifact, target, reason, targets),
  };
}

function detect(ctx: ConformanceContext): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const artifact of ctx.catalog.artifacts) {
    if (artifact.kind !== 'hook') continue;
    for (const target of ctx.targets) {
      const skipReason = hookRenderer(target);
      if (skipReason === undefined) continue;
      const finding = findingFor(artifact, target, skipReason, ctx.targets);
      if (finding !== undefined) findings.push(finding);
    }
  }
  return findings;
}

export const hookTargetRenderRule: ConformanceRule = {
  id: 'hook-target-render',
  title: 'Every hook a target ships to must render on that target',
  class: 'mechanical',
  appliesTo: {},
  rationale:
    'A hook sigil installs for a target that cannot render it silently never runs there, while ' +
    'the catalog and every other target look correct — only this cross-check catches the gap ' +
    'before release.',
  detect,
};
