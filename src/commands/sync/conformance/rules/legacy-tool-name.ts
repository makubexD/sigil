/**
 * `legacy-tool-name` — an agent's `tools` / `disallowedTools`, a skill's `allowedTools`, or a
 * hook's `event` / `matcher` must name the provider-neutral vocabulary (`read`, `search`, `edit`,
 * `shell`, …; `before-tool`, `after-tool`, …), never a provider's own names. The catalog used to
 * author Claude Code's names (`Read`, `Grep`, `Bash`, `PreToolUse`, …); those leak verbatim into
 * targets that read a different vocabulary, and the schema comment already says the field is
 * vendor-neutral (see docs/decisions/neutral-agent-vocabulary-2026-11.md and
 * docs/decisions/neutral-hook-contract-2026-11.md, which adopt Copilot's alias table and the hook
 * alias table as the shared legacy sets in src/tool-vocabulary.ts and src/hook-vocabulary.ts).
 *
 * The fix rewrites each affected list entry by entry — a legacy name becomes its neutral name,
 * every other entry (a neutral name, or an opaque provider pattern such as `Bash(git log:*)`)
 * stays exactly as written — then dedupes in first-seen order. It deliberately does NOT write
 * `normalizeTools(...).tools`: that list drops patterns and unknown names, which here would
 * delete a permission pattern the author meant to keep. A hook event becomes its neutral event;
 * a hook matcher is split on `|`, each part rewritten the same way, then joined back. Deterministic,
 * so this is `mechanical`.
 *
 * @module
 */
import type { Artifact } from '../../../../types';
import type { ConformanceRule, ConformanceFinding, ArtifactEdit } from '../types';
import { COPILOT_AGENTS_DOC } from '../../../../targets/doc-refs';
import { LEGACY_TOOL_ALIASES } from '../../../../tool-vocabulary';
import { normalizeHookEvent, parseHookMatcher } from '../../../../hook-vocabulary';

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

/** The report lines naming each legacy tool entry beside its neutral replacement. */
function toolDetailParts(artifact: Artifact): string[] {
  return fieldsWithLegacyNames(artifact).map(({ field, list }) => {
    const pairs = list
      .filter(entry => neutralFor(entry) !== undefined)
      .map(entry => `${entry} → ${neutralFor(entry)}`);
    return `${field} ${pairs.join(', ')}`;
  });
}

/** A hook's legacy `event`: its report line and its neutral replacement. */
function hookEventLegacy(artifact: Artifact): { part: string; event: string } | undefined {
  const event = artifact.frontmatter.event;
  if (typeof event !== 'string') return undefined;
  const normalized = normalizeHookEvent(event);
  if (!normalized?.legacy) return undefined;
  return { part: `event ${event} → ${normalized.event}`, event: normalized.event };
}

/** A hook's legacy `matcher`: its report line and its rewritten, deduped value. */
function hookMatcherLegacy(artifact: Artifact): { part: string; matcher: string } | undefined {
  const matcher = artifact.frontmatter.matcher;
  if (typeof matcher !== 'string') return undefined;
  const parsed = parseHookMatcher(matcher);
  if (parsed.kind !== 'tools' || parsed.legacy.length === 0) return undefined;
  const pairs = parsed.legacy.map(name => `${name} → ${neutralFor(name)}`);
  const rewritten = rewriteToolList(matcher.split('|').map(part => part.trim())).join('|');
  return { part: `matcher ${pairs.join(', ')}`, matcher: rewritten };
}

/** A hook's legacy `event` / `matcher`: the report lines to add and the patch that fixes them. */
function hookLegacy(artifact: Artifact): { parts: string[]; patch: Record<string, unknown> } {
  if (artifact.kind !== 'hook') return { parts: [], patch: {} };
  const parts: string[] = [];
  const patch: Record<string, unknown> = {};
  const event = hookEventLegacy(artifact);
  if (event) {
    parts.push(event.part);
    patch.event = event.event;
  }
  const matcher = hookMatcherLegacy(artifact);
  if (matcher) {
    parts.push(matcher.part);
    patch.matcher = matcher.matcher;
  }
  return { parts, patch };
}

/** Everything wrong with `artifact`, as the report lines that name it. */
function legacyParts(artifact: Artifact): string[] {
  return [...toolDetailParts(artifact), ...hookLegacy(artifact).parts];
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const artifact of ctx.catalog.artifacts) {
    const parts = legacyParts(artifact);
    if (parts.length === 0) continue;
    findings.push({
      ruleId: 'legacy-tool-name',
      severity: 'error',
      artifactId: artifact.id,
      filePath: artifact.filePath,
      detail: `legacy tool names: ${parts.join('; ')}`,
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
  const frontmatterPatch: Record<string, unknown> = { ...hookLegacy(artifact).patch };
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
  appliesTo: { kinds: ['agent', 'skill', 'hook'] },
  rationale:
    'Catalog tool lists are provider-neutral; a provider tool name leaks the old vocabulary into ' +
    'every target that speaks a different one.',
  docs: [COPILOT_AGENTS_DOC],
  detect,
  fix,
};
