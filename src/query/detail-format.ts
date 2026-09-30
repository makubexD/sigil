/**
 * formatDetailText — renders an ArtifactDetail into human-readable terminal lines.
 * Split out of detail.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import type { ArtifactDetail } from './detail';

/** Column width for the `sigil get` text-output label (wider than the CLI's general 12-col convention — this view has longer field names like "resolvedRules:"). */
const DETAIL_LABEL_COL_WIDTH = 18;

/** Pushes a `  label   value` row onto `lines` (label padded to a fixed column width). */
function pushRow(lines: string[], label: string, value: string): void {
  lines.push(`  ${label.padEnd(DETAIL_LABEL_COL_WIDTH)} ${value}`);
}

/** Header block: kind + id, title, blank separator. */
function renderHeaderLines(detail: ArtifactDetail): string[] {
  return ['', `  ${detail.kind.toUpperCase()}  ${detail.id}`, `  ${detail.title}`, ''];
}

/** Common fields present on every kind: description, language, tags, platforms, etc. */
function renderCommonFieldLines(detail: ArtifactDetail): string[] {
  const lines: string[] = [];
  pushRow(lines, 'description:', detail.description);
  if (detail.language) pushRow(lines, 'language:', detail.language);
  if (detail.tags.length) pushRow(lines, 'tags:', detail.tags.join(', '));

  const platformsLabel =
    detail.platforms && detail.platforms.length
      ? `[${detail.platforms.join(', ')}]`
      : 'all supporting targets (DRY default)';
  pushRow(lines, 'platforms:', platformsLabel);
  pushRow(
    lines,
    'emits to:',
    detail.targetPlatforms.length ? detail.targetPlatforms.join(', ') : '(none)',
  );
  pushRow(lines, 'source file:', detail.filePath);
  return lines;
}

/** Formats the `claude:` frontmatter namespace summary line, or '' if nothing is set. */
function formatClaudeFieldsSummary(claude: NonNullable<ArtifactDetail['claude']>): string {
  return [
    claude.model && `model=${claude.model}`,
    claude.effort && `effort=${claude.effort}`,
    claude.maxTurns != null && `maxTurns=${claude.maxTurns}`,
    claude.isolation && `isolation=${claude.isolation}`,
  ]
    .filter(Boolean)
    .join(', ');
}

/** Renders appliesTo/appliesToRationale/severity/extends (rule-kind fields) into `lines`. */
function renderRuleFieldLines(lines: string[], detail: ArtifactDetail): void {
  if (detail.appliesTo) pushRow(lines, 'appliesTo:', detail.appliesTo.join(', '));
  if (detail.appliesToRationale) {
    pushRow(lines, 'appliesToRationale:', detail.appliesToRationale);
  }
  if (detail.severity) pushRow(lines, 'severity:', detail.severity);
  if (detail.extends?.length) pushRow(lines, 'extends:', detail.extends.join(', '));
}

/** Renders uses.rules/uses.agents (skill-kind fields) into `lines`. */
function renderUsesFieldLines(lines: string[], detail: ArtifactDetail): void {
  if (!detail.uses) return;
  if (detail.uses.rules.length) pushRow(lines, 'uses.rules:', detail.uses.rules.join(', '));
  if (detail.uses.agents.length) pushRow(lines, 'uses.agents:', detail.uses.agents.join(', '));
}

/** Renders tools/disallowedTools/claude/args (agent-kind fields) into `lines`. */
function renderAgentFieldLines(lines: string[], detail: ArtifactDetail): void {
  if (detail.tools?.length) pushRow(lines, 'tools:', detail.tools.join(', '));
  if (detail.disallowedTools?.length) {
    pushRow(lines, 'disallowedTools:', detail.disallowedTools.join(', '));
  }

  if (detail.claude) {
    const parts = formatClaudeFieldsSummary(detail.claude);
    if (parts) pushRow(lines, 'claude:', parts);
  }

  if (detail.args?.length) {
    pushRow(
      lines,
      'args:',
      detail.args.map(a => a.name + (a.required ? ' (required)' : '')).join(', '),
    );
  }
}

/** Kind-specific fields: appliesTo, severity, extends, uses, tools, disallowedTools, claude, args. */
function renderKindSpecificFieldLines(detail: ArtifactDetail): string[] {
  const lines: string[] = [];
  renderRuleFieldLines(lines, detail);
  renderUsesFieldLines(lines, detail);
  renderAgentFieldLines(lines, detail);
  return lines;
}

/** `steps:` section (workflow artifacts). Empty array when there are no steps. */
function renderStepsSectionLines(detail: ArtifactDetail): string[] {
  if (!detail.steps?.length) return [];
  const lines: string[] = ['', '  steps:'];
  for (const step of detail.steps) {
    const desc = step.description ? `  — ${step.description}` : '';
    lines.push(`    → ${step.ref}${desc}`);
  }
  return lines;
}

/** `resolved dependency closure:` section. Empty array when there are no resolved deps. */
function renderDependencyClosureLines(detail: ArtifactDetail): string[] {
  if (!detail.resolvedRules.length && !detail.resolvedAgentIds.length) return [];
  const lines: string[] = ['', '  resolved dependency closure:'];
  for (const r of detail.resolvedRules) lines.push(`    rule:  ${r}`);
  for (const a of detail.resolvedAgentIds) lines.push(`    agent: ${a}`);
  return lines;
}

/** `used by (N skills):` section. Empty array when nothing depends on this artifact. */
function renderReverseDependentsLines(detail: ArtifactDetail): string[] {
  if (!detail.reverseDependents.length) return [];
  const lines: string[] = [
    '',
    `  used by (${detail.reverseDependents.length} skill${detail.reverseDependents.length !== 1 ? 's' : ''}):`,
  ];
  for (const dep of detail.reverseDependents) lines.push(`    ${dep}`);
  return lines;
}

/**
 * Format an ArtifactDetail for human-readable terminal output.
 * Returns an array of lines ready to join with '\n'.
 */
export function formatDetailText(detail: ArtifactDetail): string[] {
  return [
    ...renderHeaderLines(detail),
    ...renderCommonFieldLines(detail),
    ...renderKindSpecificFieldLines(detail),
    ...renderStepsSectionLines(detail),
    ...renderDependencyClosureLines(detail),
    ...renderReverseDependentsLines(detail),
    '',
  ];
}
