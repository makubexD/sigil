/**
 * `config-target-render` — a catalog config artifact (`hook`, `mcp`, `settings`) that ships to a
 * target (`platforms:` absent or naming it) must actually render there. A target that delivers a
 * config kind natively declares the artifacts it cannot render through `Target.configSkipReason`.
 * Hooks: Cursor today refuses an event or matcher its Claude Code alias table has no entry for, or
 * a command line PowerShell would break. MCP: a server (or a token inside it) a target's dialect
 * cannot expand or carry, see `src/targets/mcp-dialect.ts`. `add` and the wizard then skip that
 * artifact with the reason, but at release time nothing else notices the mismatch — the catalog
 * artifact simply never installs on one target while every other target and the catalog source
 * look fine.
 *
 * A non-undefined reason is an error here: the author either adds `platforms:` without this
 * target, or changes the artifact so it can be rendered. No `fix()`: which of the two the artifact
 * should do is a catalog decision, not a safe unattended rewrite.
 *
 * @module
 */
import type { Artifact, ArtifactKind, ResolvedArtifact, Target } from '../../../../types';
import type { ConformanceContext, ConformanceFinding, ConformanceRule } from '../types';
import { nativeKinds } from '../../../../targets/capabilities';
import { artifactTargetsPlatform } from '../../../../select/selection';
import { isConfigKind } from '../../../../kinds';

/** How the fix text names what to change, per config kind. */
const FIX_TAIL: Partial<Record<ArtifactKind, string>> = {
  hook: "change the hook's event/matcher so it can render.",
  mcp: 'change the server so it can render.',
  settings: 'change the settings so they can render.',
};

/** Targets that deliver `kind` natively and declare a renderer, i.e. can refuse some. */
function configRenderer(target: Target, kind: ArtifactKind): Target['configSkipReason'] {
  if (!nativeKinds(target, 'scaffold').includes(kind)) return undefined;
  return target.configSkipReason;
}

/** The finding's detail: the artifact, the target, the reason, and the two ways to fix it. */
function detailFor(
  artifact: Artifact,
  target: Target,
  reason: string,
  targets: readonly Target[],
): string {
  const others = targets.map(t => t.name).filter(name => name !== target.name);
  const fix = FIX_TAIL[artifact.kind] ?? 'change it so it can render.';
  return (
    `${artifact.kind} '${artifact.id}' ships to target '${target.name}', but '${target.name}' ` +
    `cannot render it: ${reason} Fix: add \`platforms: [${others.join(', ')}]\` (every ` +
    `registered target except '${target.name}'), or ${fix}`
  );
}

/** The finding for one (artifact, target) pair, or undefined when it renders or is not shipped. */
function findingFor(
  artifact: Artifact,
  target: Target,
  skipReason: NonNullable<Target['configSkipReason']>,
  targets: readonly Target[],
): ConformanceFinding | undefined {
  if (!artifactTargetsPlatform(artifact, target.name)) return undefined;
  const reason = skipReason.call(target, artifact as ResolvedArtifact);
  if (reason === undefined) return undefined;
  return {
    ruleId: 'config-target-render',
    severity: 'error',
    artifactId: artifact.id,
    provider: target.name,
    detail: detailFor(artifact, target, reason, targets),
  };
}

function detect(ctx: ConformanceContext): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const artifact of ctx.catalog.artifacts) {
    if (!isConfigKind(artifact.kind)) continue;
    for (const target of ctx.targets) {
      const skipReason = configRenderer(target, artifact.kind);
      if (skipReason === undefined) continue;
      const finding = findingFor(artifact, target, skipReason, ctx.targets);
      if (finding !== undefined) findings.push(finding);
    }
  }
  return findings;
}

export const configTargetRenderRule: ConformanceRule = {
  id: 'config-target-render',
  title: 'Every config artifact a target ships to must render on that target',
  class: 'mechanical',
  appliesTo: {},
  rationale:
    'A hook or MCP server sigil installs for a target that cannot render it silently never runs ' +
    'there, while the catalog and every other target look correct — only this cross-check catches ' +
    'the gap before release.',
  detect,
};
