/**
 * `legacy-tool-name` — an agent's `tools` / `disallowedTools` or a skill's `allowedTools` must
 * name the provider-neutral tool vocabulary (`read`, `search`, `edit`, `shell`, …), never a
 * provider's own tool names. The catalog used to author Claude Code's names (`Read`, `Grep`,
 * `Bash`, …); those leak verbatim into targets that read a different vocabulary, and the schema
 * comment already says the field is vendor-neutral (see docs/decisions/neutral-agent-vocabulary-2026-11.md,
 * which adopts Copilot's alias table as the shared legacy set in src/tool-vocabulary.ts).
 *
 * The fix rewrites each affected list entry by entry — a legacy name becomes its neutral name,
 * every other entry (a neutral name, or an opaque provider pattern such as `Bash(git log:*)`)
 * stays exactly as written — then dedupes in first-seen order. It deliberately does NOT write
 * `normalizeTools(...).tools`: that list drops patterns and unknown names, which here would
 * delete a permission pattern the author meant to keep. Deterministic, so this is `mechanical`.
 *
 * @module
 */
import type { Artifact } from '../../../../types';
import type { ConformanceRule, ConformanceFinding, ArtifactEdit } from '../types';
import { COPILOT_AGENTS_DOC } from '../../../../targets/doc-refs';
import { LEGACY_TOOL_ALIASES } from '../../../../tool-vocabulary';

/** The frontmatter fields each kind can author a tool list on, in report order. */
const TOOL_FIELDS: Readonly<Record<string, readonly string[]>> = {
  agent: ['tools', 'disallowedTools'],
  skill: ['allowedTools'],
};

/** The neutral replacement for a legacy tool name, or `undefined` for anything else. */
function neutralFor(name: string): string | undefined {
  // Own keys only: `constructor`, `toString` and friends are not aliases.
  return Object.hasOwn(LEGACY_TOOL_ALIASES, name) ? LEGACY_TOOL_ALIASES[name] : undefined;
}

/** An authored tool list, or `undefined` when the field is absent or not an array. */
function toolList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/** Rewrite legacy names to neutral ones, then dedupe keeping first-seen order. */
function rewriteToolList(list: readonly string[]): string[] {
  const rewritten: string[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const next = neutralFor(entry) ?? entry;
    if (seen.has(next)) continue;
    seen.add(next);
    rewritten.push(next);
  }
  return rewritten;
}

/** The fields of `artifact` that hold at least one legacy tool name. */
function fieldsWithLegacyNames(artifact: Artifact): { field: string; list: string[] }[] {
  return (TOOL_FIELDS[artifact.kind] ?? []).flatMap(field => {
    const list = toolList(artifact.frontmatter[field]);
    if (!list || !list.some(entry => neutralFor(entry) !== undefined)) return [];
    return [{ field, list }];
  });
}

/** The report line naming each legacy entry beside its neutral replacement. */
function legacyDetail(fields: { field: string; list: string[] }[]): string {
  const parts = fields.map(({ field, list }) => {
    const pairs = list
      .filter(entry => neutralFor(entry) !== undefined)
      .map(entry => `${entry} → ${neutralFor(entry)}`);
    return `${field} ${pairs.join(', ')}`;
  });
  return `legacy tool names: ${parts.join('; ')}`;
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const artifact of ctx.catalog.artifacts) {
    const fields = fieldsWithLegacyNames(artifact);
    if (fields.length === 0) continue;
    findings.push({
      ruleId: 'legacy-tool-name',
      severity: 'error',
      artifactId: artifact.id,
      filePath: artifact.filePath,
      detail: legacyDetail(fields),
    });
  }
  return findings;
}

function fix(
  finding: ConformanceFinding,
  ctx: Parameters<ConformanceRule['detect']>[0],
): ArtifactEdit | undefined {
  if (!finding.artifactId) return undefined;
  const artifact = ctx.catalog.byId.get(finding.artifactId);
  if (!artifact) return undefined;
  const frontmatterPatch: Record<string, unknown> = {};
  for (const { field, list } of fieldsWithLegacyNames(artifact)) {
    frontmatterPatch[field] = rewriteToolList(list);
  }
  if (Object.keys(frontmatterPatch).length === 0) return undefined;
  return { artifactId: artifact.id, filePath: artifact.filePath, frontmatterPatch };
}

export const legacyToolNameRule: ConformanceRule = {
  id: 'legacy-tool-name',
  title: 'A tool field names a legacy provider tool instead of a neutral one',
  class: 'mechanical',
  appliesTo: { kinds: ['agent', 'skill'] },
  rationale:
    'Catalog tool lists are provider-neutral; a provider tool name leaks the old vocabulary into ' +
    'every target that speaks a different one.',
  docs: [COPILOT_AGENTS_DOC],
  detect,
  fix,
};
