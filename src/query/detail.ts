/**
 * getArtifactDetail + formatDetailText — support for the `sigil get` command.
 * Pure functions, no I/O.
 */
import type { ResolvedArtifact, LoadedCatalog, Target } from '../types';
import { artifactTargetsPlatform } from '../select';
import { hasUsesClosure } from '../kinds';

export interface ArtifactDetail {
  id: string;
  kind: string;
  title: string;
  description: string;
  tags: string[];
  language: string | undefined;
  version: string | undefined;
  platforms: string[] | undefined; // undefined = all supporting targets
  filePath: string;

  // Kind-specific fields (undefined when not applicable)
  appliesTo: string[] | undefined;
  severity: string | undefined;
  extends: string[] | undefined;
  uses:
    | {
        rules: string[];
        agents: string[];
      }
    | undefined;
  tools: string[] | undefined;
  disallowedTools: string[] | undefined;
  claude:
    | {
        model?: string;
        effort?: string;
        maxTurns?: number;
        isolation?: string;
      }
    | undefined;
  args: Array<{ name: string; description?: string; required?: boolean }> | undefined;
  steps: Array<{ ref: string; description?: string }> | undefined;

  // Resolved dependency tree (from resolve phase)
  resolvedRules: string[]; // IDs only
  resolvedAgentIds: string[];

  // Reverse dependents (skills that use this artifact via `uses:`)
  reverseDependents: string[];

  // Which registered targets will emit this artifact
  targetPlatforms: string[];
}

/**
 * Assemble a full detail record for a single artifact.
 *
 * @param artifact   The resolved artifact from the catalog.
 * @param rawCatalog The raw loaded catalog (for reverse-dep scan).
 * @param targets    All registered targets (for targetPlatforms + platforms label).
 */
export function getArtifactDetail(
  artifact: ResolvedArtifact,
  rawCatalog: LoadedCatalog,
  targets: Target[],
): ArtifactDetail {
  const fm = artifact.frontmatter;

  // Reverse-dependent scan: skills whose uses.rules or uses.agents include this id
  const reverseDependents: string[] = [];
  for (const a of rawCatalog.artifacts) {
    if (!hasUsesClosure(a.kind)) continue;
    const uses = a.frontmatter.uses as { rules?: string[]; agents?: string[] } | undefined;
    const usesRule = (uses?.rules ?? []).includes(artifact.id);
    const usesAgent = (uses?.agents ?? []).includes(artifact.id);
    if (usesRule || usesAgent) reverseDependents.push(a.id);
  }

  // Which targets will actually emit this artifact
  const targetPlatforms = targets
    .filter(t => {
      if (t.supportedKinds && !t.supportedKinds.includes(artifact.kind as never)) return false;
      return artifactTargetsPlatform(artifact, t.name);
    })
    .map(t => t.name);

  return {
    id: artifact.id,
    kind: artifact.kind,
    title: (fm.title as string | undefined) ?? '',
    description: (fm.description as string | undefined) ?? '',
    tags: (fm.tags as string[] | undefined) ?? [],
    language: fm.language as string | undefined,
    version: fm.version as string | undefined,
    platforms: fm.platforms as string[] | undefined,
    filePath: artifact.filePath,

    appliesTo: fm.appliesTo as string[] | undefined,
    severity: fm.severity as string | undefined,
    extends: fm.extends as string[] | undefined,
    uses: fm.uses as ArtifactDetail['uses'] | undefined,
    tools: fm.tools as string[] | undefined,
    disallowedTools: fm.disallowedTools as string[] | undefined,
    claude: fm.claude as ArtifactDetail['claude'] | undefined,
    args: fm.args as ArtifactDetail['args'] | undefined,
    steps: fm.steps as ArtifactDetail['steps'] | undefined,

    resolvedRules: (artifact.resolvedRules ?? []).map(r => r.id),
    resolvedAgentIds: artifact.resolvedAgentIds ?? [],

    reverseDependents,
    targetPlatforms,
  };
}

/**
 * Format an ArtifactDetail for human-readable terminal output.
 * Returns an array of lines ready to join with '\n'.
 */
export function formatDetailText(detail: ArtifactDetail): string[] {
  const lines: string[] = [];
  const row = (label: string, value: string) => lines.push(`  ${label.padEnd(18)} ${value}`);

  lines.push('');
  lines.push(`  ${detail.kind.toUpperCase()}  ${detail.id}`);
  lines.push(`  ${detail.title}`);
  lines.push('');

  row('description:', detail.description);
  if (detail.language) row('language:', detail.language);
  if (detail.version) row('version:', detail.version);
  if (detail.tags.length) row('tags:', detail.tags.join(', '));

  const platformsLabel =
    detail.platforms && detail.platforms.length
      ? `[${detail.platforms.join(', ')}]`
      : 'all supporting targets (DRY default)';
  row('platforms:', platformsLabel);
  row('emits to:', detail.targetPlatforms.length ? detail.targetPlatforms.join(', ') : '(none)');
  row('source file:', detail.filePath);

  if (detail.appliesTo) row('appliesTo:', detail.appliesTo.join(', '));
  if (detail.severity) row('severity:', detail.severity);
  if (detail.extends?.length) row('extends:', detail.extends.join(', '));

  if (detail.uses) {
    if (detail.uses.rules.length) row('uses.rules:', detail.uses.rules.join(', '));
    if (detail.uses.agents.length) row('uses.agents:', detail.uses.agents.join(', '));
  }

  if (detail.tools?.length) row('tools:', detail.tools.join(', '));
  if (detail.disallowedTools?.length) row('disallowedTools:', detail.disallowedTools.join(', '));

  if (detail.claude) {
    const c = detail.claude;
    const parts = [
      c.model && `model=${c.model}`,
      c.effort && `effort=${c.effort}`,
      c.maxTurns != null && `maxTurns=${c.maxTurns}`,
      c.isolation && `isolation=${c.isolation}`,
    ]
      .filter(Boolean)
      .join(', ');
    if (parts) row('claude:', parts);
  }

  if (detail.args?.length) {
    row('args:', detail.args.map(a => a.name + (a.required ? ' (required)' : '')).join(', '));
  }

  if (detail.steps?.length) {
    lines.push('');
    lines.push('  steps:');
    for (const step of detail.steps) {
      const desc = step.description ? `  — ${step.description}` : '';
      lines.push(`    → ${step.ref}${desc}`);
    }
  }

  if (detail.resolvedRules.length || detail.resolvedAgentIds.length) {
    lines.push('');
    lines.push('  resolved dependency closure:');
    for (const r of detail.resolvedRules) lines.push(`    rule:  ${r}`);
    for (const a of detail.resolvedAgentIds) lines.push(`    agent: ${a}`);
  }

  if (detail.reverseDependents.length) {
    lines.push('');
    lines.push(
      `  used by (${detail.reverseDependents.length} skill${detail.reverseDependents.length !== 1 ? 's' : ''}):`,
    );
    for (const dep of detail.reverseDependents) lines.push(`    ${dep}`);
  }

  lines.push('');
  return lines;
}
