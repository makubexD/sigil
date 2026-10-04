/**
 * `tool-restriction-coverage` — an agent's tool restriction (`tools`, `disallowedTools`) must reach
 * every target the agent ships to. A provider that has no mapping for one of those fields drops it,
 * and an agent with no restriction gets every tool: `disallowedTools: [Edit]` on a target that cannot
 * express it installs an agent that can edit. `declared-but-unemitted` only asks that *some* provider
 * maps a field; this rule asks it of each provider the agent actually targets (`platforms:`).
 *
 * Data-driven: it reads each target's agent `KindEmitSpec` mappings, so a new target is covered the
 * moment it registers its specs. No `fix()`: the author either narrows `platforms:` or replaces the
 * restriction with a `tools` allowlist every target carries.
 *
 * @module
 */
import type { Artifact, Target } from '../../../../types';
import type { ConformanceRule, ConformanceFinding } from '../types';
import { allProviderSpecs } from '../../../../targets/all-emit-specs';
import { artifactTargetsPlatform } from '../../../../select';
import { supportsKind } from '../../../../targets/capabilities';
import { TOOL_RESTRICTION_FIELDS } from '../../../../targets/tool-restriction';

/** The agent fields `target`'s agent specs map — the restrictions it can carry. */
function carriedFields(target: Target): Set<string> {
  return new Set(
    allProviderSpecs()
      .filter(s => s.source.startsWith(`${target.name}/`) && s.spec.kind === 'agent')
      .flatMap(s => s.spec.frontmatter)
      .map(mapping => mapping.from),
  );
}

/** One finding per restriction field `agent` declares that a target it ships to cannot carry. */
function findingsForAgent(
  agent: Artifact,
  targets: readonly Target[],
  carried: ReadonlyMap<string, Set<string>>,
): ConformanceFinding[] {
  const declared = TOOL_RESTRICTION_FIELDS.filter(f => agent.frontmatter[f] !== undefined);
  return targets
    .filter(t => artifactTargetsPlatform(agent, t.name) && supportsKind(t, 'agent'))
    .flatMap(target =>
      declared
        .filter(field => !carried.get(target.name)?.has(field))
        .map(field => droppedFieldFinding(agent, target.name, field)),
    );
}

function droppedFieldFinding(agent: Artifact, provider: string, field: string): ConformanceFinding {
  return {
    ruleId: 'tool-restriction-coverage',
    severity: 'error',
    artifactId: agent.id,
    filePath: agent.filePath,
    provider,
    detail:
      `'${field}' is dropped on ${provider}, so the agent would get every tool there — ` +
      `set platforms: to exclude ${provider}, or use a tools allowlist instead`,
  };
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const carried = new Map(ctx.targets.map(t => [t.name, carriedFields(t)]));
  return ctx.catalog.artifacts
    .filter(a => a.kind === 'agent')
    .flatMap(agent => findingsForAgent(agent, ctx.targets, carried));
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
