/**
 * Build an ImportPlan from discovered + translated artifacts.
 *
 * For each discovered file:
 *   1. Translate frontmatter (via translate.ts)
 *   2. Compute the catalog destination path (via computeDestinationPath from move/plan.ts)
 *   3. Render the output file content (catalog-style YAML frontmatter + verbatim body)
 *
 * Returns an ImportPlan that can be used for dry-run display or actual file writes.
 */
import fs from 'fs';
import path from 'path';
import { computeDestinationPath } from '../move/plan';
import { serializeYamlEntry } from '../frontmatter';
import { translateFrontmatter } from './translate';
import type { DiscoveredFile } from './discover';
import type { CatalogFrontmatter } from './translate';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportItem {
  /** Source file path. */
  sourcePath: string;
  /** Relative source path (for display). */
  relativePath: string;
  /** Translated catalog frontmatter. */
  frontmatter: CatalogFrontmatter;
  /** Verbatim body text from the source file. */
  body: string;
  /** Absolute destination path in the catalog. */
  destPath: string;
  /** Fields from the source frontmatter that had no mapping. */
  droppedFields: string[];
  /** True when destPath already exists on disk. */
  conflicts: boolean;
  /** True when the description was absent from the source and a generic fallback was used. */
  descriptionSynthesized?: boolean | undefined;
}

export interface ImportPlan {
  items: ImportItem[];
  droppedFieldsSummary: Array<{ relativePath: string; fields: string[] }>;
}

// ─── File renderer ────────────────────────────────────────────────────────────

/** Base frontmatter entries common to every kind: id/kind/title/description/name?/language?. */
function buildBaseEntries(frontmatter: CatalogFrontmatter): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = [
    ['id', frontmatter.id],
    ['kind', frontmatter.kind],
    ['title', frontmatter.title],
    ['description', frontmatter.description],
  ];
  if (frontmatter.name !== undefined) entries.push(['name', frontmatter.name]);
  if (frontmatter.language !== undefined) entries.push(['language', frontmatter.language]);
  return entries;
}

/** Rule-only entries: appliesTo/severity/extends. */
function buildRuleEntries(frontmatter: CatalogFrontmatter): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = [];
  if (frontmatter.appliesTo !== undefined) entries.push(['appliesTo', frontmatter.appliesTo]);
  if (frontmatter.severity !== undefined) entries.push(['severity', frontmatter.severity]);
  if (frontmatter.extends !== undefined) entries.push(['extends', frontmatter.extends]);
  return entries;
}

/** Skill-only entries: whenToUse/allowedTools/argumentHint/disableModelInvocation. */
function buildSkillEntries(frontmatter: CatalogFrontmatter): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = [];
  if (frontmatter.whenToUse !== undefined) entries.push(['whenToUse', frontmatter.whenToUse]);
  if (frontmatter.allowedTools !== undefined)
    entries.push(['allowedTools', frontmatter.allowedTools]);
  if (frontmatter.argumentHint !== undefined)
    entries.push(['argumentHint', frontmatter.argumentHint]);
  if (frontmatter.disableModelInvocation === true) entries.push(['disableModelInvocation', true]);
  return entries;
}

/** Kind-specific frontmatter entries (rule/skill/agent), appended after the base entries. */
function buildKindSpecificEntries(frontmatter: CatalogFrontmatter): Array<[string, unknown]> {
  if (frontmatter.kind === 'rule') return buildRuleEntries(frontmatter);
  if (frontmatter.kind === 'skill') return buildSkillEntries(frontmatter);
  if (frontmatter.kind === 'agent' && frontmatter.tools && frontmatter.tools.length > 0) {
    return [['tools', frontmatter.tools]];
  }
  return [];
}

/**
 * Builds the skill `uses:` YAML block with a dedicated renderer, because
 * serializeYamlEntry's object branch calls serializeScalar on array values,
 * which gives empty strings for []. We need `rules: []` and `agents: []`.
 */
function buildUsesBlock(uses: NonNullable<CatalogFrontmatter['uses']>): string {
  const rules = uses.rules ?? [];
  const agents = uses.agents ?? [];
  if (rules.length === 0 && agents.length === 0) {
    return 'uses:\n  rules: []\n  agents: []';
  }
  const ruleLines = rules.length > 0 ? `\n${rules.map(r => `    - ${r}`).join('\n')}` : ' []';
  const agentLines = agents.length > 0 ? `\n${agents.map(a => `    - ${a}`).join('\n')}` : ' []';
  return `uses:\n  rules:${ruleLines}\n  agents:${agentLines}`;
}

/** Renders the full YAML frontmatter block (entries + tags + optional skill `uses:` block). */
function buildFrontmatterYaml(frontmatter: CatalogFrontmatter): string {
  // Build ordered frontmatter: required base fields first, then kind-specific, then tags
  const entries = [
    ...buildBaseEntries(frontmatter),
    ...buildKindSpecificEntries(frontmatter),
    ['tags', frontmatter.tags] as [string, unknown],
  ];
  const yamlLines = entries.map(([k, v]) => serializeYamlEntry(k, v));

  // Inject uses block for skills before tags — always empty arrays at import time;
  // dependency wiring is a content-refinement concern handled with `sigil patch` afterward.
  if (frontmatter.kind === 'skill' && frontmatter.uses !== undefined) {
    yamlLines.splice(yamlLines.length - 1, 0, buildUsesBlock(frontmatter.uses));
  }
  return yamlLines.join('\n');
}

/**
 * Render a catalog-style artifact file string from translated frontmatter + body.
 *
 * Uses the same `serializeYamlEntry` serializer as `writeArtifactFrontmatter` so the
 * output matches catalog authoring style exactly. The body is preserved verbatim.
 */
export function renderArtifactFile(frontmatter: CatalogFrontmatter, body: string): string {
  const yaml = buildFrontmatterYaml(frontmatter);
  // Ensure body starts with a blank line after the closing ---
  const bodyNormalized = body.startsWith('\n') ? body : `\n${body}`;
  return `---\n${yaml}\n---${bodyNormalized}`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface PlanOptions {
  /** Target catalog language key (e.g. "csharp"). */
  language: string;
  /** Language display name for title generation (e.g. ".NET / C#"). */
  displayName: string;
  /** Catalog root directory (for destination path computation). */
  catalogDir: string;
}

/** Prepends the skill body prefix (e.g. "## When to Use" section), if any. */
function applyBodyPrefix(bodyPrefix: string | undefined, body: string): string {
  return bodyPrefix ? `${bodyPrefix}${body.trimStart()}` : body;
}

/** Translates and builds one discovered file's ImportItem. */
function buildImportItem(file: DiscoveredFile, opts: PlanOptions): ImportItem {
  const t = translateFrontmatter(file.kind, file.slug, file.frontmatter, {
    language: opts.language,
    displayName: opts.displayName,
  });
  const destPath = computeDestinationPath(t.frontmatter.id, file.kind, opts.catalogDir);

  return {
    sourcePath: file.sourcePath,
    relativePath: file.relativePath,
    frontmatter: t.frontmatter,
    body: applyBodyPrefix(t.bodyPrefix, file.body),
    destPath,
    droppedFields: t.droppedFields,
    conflicts: fs.existsSync(destPath),
    descriptionSynthesized: t.descriptionSynthesized,
  };
}

/**
 * Build an ImportPlan from a list of discovered files.
 *
 * @param discovered  Output from discoverFiles().discovered
 * @param opts        Language/catalog context
 */
export function buildImportPlan(discovered: DiscoveredFile[], opts: PlanOptions): ImportPlan {
  const items = discovered.map(file => buildImportItem(file, opts));
  const droppedFieldsSummary: ImportPlan['droppedFieldsSummary'] = items
    .filter(item => item.droppedFields.length > 0)
    .map(item => ({ relativePath: item.relativePath, fields: item.droppedFields }));

  return { items, droppedFieldsSummary };
}

/**
 * Compute the catalog path for a language.yaml file.
 * shared prefix → catalog/shared/language.yaml (not applicable, shared has no language.yaml)
 * language prefix → catalog/languages/<lang>/language.yaml
 */
export function languageYamlPath(language: string, catalogDir: string): string {
  return path.join(catalogDir, 'languages', language, 'language.yaml');
}
