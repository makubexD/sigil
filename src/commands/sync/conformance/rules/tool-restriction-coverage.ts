/**
 * `tool-restriction-coverage` — an agent's tool restriction (`tools`, `disallowedTools`) must reach
 * every target the agent ships to. Every provider gives an agent with no restriction every tool, so
 * an agent whose restriction a target cannot express exactly would install there with every tool.
 * `declared-but-unemitted` only asks that *some* provider maps a field; this rule asks it of each
 * provider the agent actually targets (`platforms:`).
 *
 * Data-driven: each target's agent `KindEmitSpec`s go through `restrictionOutcome`, the same check
 * `add` and `build` apply, so the rule reads the target's `ToolDialect` and honours
 * `toolPolicy`. A `skip` (the fail-closed default) is an error; a `nearest` mapping
 * (`toolPolicy: nearest`) is a warning with the message install would print. No `fix()`: the author
 * either narrows `platforms:` or the tool list, or opts into `toolPolicy: nearest`.
 *
 * @module
 */
import type { Artifact, Target } from '../../../../types';
import type { ConformanceRule, ConformanceFinding } from '../types';
import type { KindEmitSpec } from '../../../../targets/spec-types';
import { allProviderSpecs } from '../../../../targets/all-emit-specs';
import { artifactTargetsPlatform } from '../../../../select';
import { supportsKind } from '../../../../targets/capabilities';
import { restrictionOutcome, type RestrictionOutcome } from '../../../../targets/tool-restriction';

/** Every agent spec `target` emits — one per channel variant (Claude has scaffold and plugin). */
function agentSpecsOf(target: Target): KindEmitSpec[] {
  return allProviderSpecs()
    .filter(s => s.source.startsWith(`${target.name}/`) && s.spec.kind === 'agent')
    .map(s => s.spec);
}

/** The worst outcome across `specs`: `skip` beats `nearest` beats `exact`. */
function worstOutcome(
  specs: readonly KindEmitSpec[],
  frontmatter: Record<string, unknown>,
): RestrictionOutcome {
  let worst: RestrictionOutcome = { kind: 'exact' };
  for (const spec of specs) {
    const outcome = restrictionOutcome(spec, frontmatter);
    if (outcome.kind === 'skip') return outcome;
    if (outcome.kind === 'nearest') worst = outcome;
  }
  return worst;
}

/** The finding `outcome` produces for `agent` on `provider`, or `undefined` for `exact`. */
function findingFor(
  agent: Artifact,
  provider: string,
  outcome: RestrictionOutcome,
): ConformanceFinding | undefined {
  if (outcome.kind === 'exact') return undefined;
  return {
    ruleId: 'tool-restriction-coverage',
    severity: outcome.kind === 'skip' ? 'error' : 'warning',
    artifactId: agent.id,
    filePath: agent.filePath,
    provider,
    detail:
      outcome.kind === 'skip'
        ? `${outcome.reason} — set platforms: to exclude ${provider}, or toolPolicy: nearest`
        : outcome.warning,
  };
}

/** At most one finding per target `agent` ships to, taking the worst spec outcome. */
function findingsForAgent(
  agent: Artifact,
  targets: readonly Target[],
  specsByTarget: ReadonlyMap<string, readonly KindEmitSpec[]>,
): ConformanceFinding[] {
  return targets
    .filter(t => artifactTargetsPlatform(agent, t.name) && supportsKind(t, 'agent'))
    .flatMap(target => {
      const outcome = worstOutcome(specsByTarget.get(target.name) ?? [], agent.frontmatter);
      const finding = findingFor(agent, target.name, outcome);
      return finding ? [finding] : [];
    });
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const specsByTarget = new Map(ctx.targets.map(t => [t.name, agentSpecsOf(t)]));
  return ctx.catalog.artifacts
    .filter(a => a.kind === 'agent')
    .flatMap(agent => findingsForAgent(agent, ctx.targets, specsByTarget));
}

export const toolRestrictionCoverageRule: ConformanceRule = {
  id: 'tool-restriction-coverage',
  title: "An agent's tool restriction must reach every target it ships to",
  class: 'mechanical',
  appliesTo: { kinds: ['agent'] },
  rationale:
    'A provider gives an agent with no tool restriction every tool, so a restriction it cannot ' +
    'express silently widens the agent.',
  detect,
};
