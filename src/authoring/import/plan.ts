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

/**
 * Render a catalog-style artifact file string from translated frontmatter + body.
 *
 * Uses the same `serializeYamlEntry` serializer as `writeArtifactFrontmatter` so the
 * output matches catalog authoring style exactly. The body is preserved verbatim.
 */
export function renderArtifactFile(frontmatter: CatalogFrontmatter, body: string): string {
  // Build ordered frontmatter: required base fields first, then kind-specific, then optional
  const entries: Array<[string, unknown]> = [];

  entries.push(['id', frontmatter.id]);
  entries.push(['kind', frontmatter.kind]);
  entries.push(['title', frontmatter.title]);
  entries.push(['description', frontmatter.description]);

  // Kind-specific required/common fields
  if (frontmatter.name !== undefined) entries.push(['name', frontmatter.name]);
  if (frontmatter.language !== undefined) entries.push(['language', frontmatter.language]);

  if (frontmatter.kind === 'rule') {
    if (frontmatter.appliesTo !== undefined) entries.push(['appliesTo', frontmatter.appliesTo]);
    if (frontmatter.severity !== undefined) entries.push(['severity', frontmatter.severity]);
    if (frontmatter.extends !== undefined) entries.push(['extends', frontmatter.extends]);
  }

  if (frontmatter.kind === 'skill') {
    if (frontmatter.appliesTo !== undefined) entries.push(['appliesTo', frontmatter.appliesTo]);
    if (frontmatter.allowedTools !== undefined) entries.push(['allowedTools', frontmatter.allowedTools]);
    if (frontmatter.argumentHint !== undefined) entries.push(['argumentHint', frontmatter.argumentHint]);
    if (frontmatter.disableModelInvocation === true) entries.push(['disableModelInvocation', true]);
  }

  if (frontmatter.kind === 'agent') {
    if (frontmatter.tools !== undefined && frontmatter.tools.length > 0) {
      entries.push(['tools', frontmatter.tools]);
    }
  }

  // Tags always last before optional fields
  entries.push(['tags', frontmatter.tags]);

  // Build the YAML block. `uses` is serialized with a dedicated helper because
  // serializeYamlEntry's object branch calls serializeScalar on array values,
  // which gives empty strings for []. We need `rules: []` and `agents: []`.
  const yamlLines: string[] = [];
  for (const [k, v] of entries) {
    yamlLines.push(serializeYamlEntry(k, v));
  }
  // Inject uses block for skills before tags — always empty arrays at import time;
  // dependency wiring is a content-refinement concern handled with `sigil patch` afterward.
  if (frontmatter.kind === 'skill' && frontmatter.uses !== undefined) {
    const rules = frontmatter.uses.rules ?? [];
    const agents = frontmatter.uses.agents ?? [];
    let usesBlock: string;
    if (rules.length === 0 && agents.length === 0) {
      usesBlock = 'uses:\n  rules: []\n  agents: []';
    } else {
      const ruleLines = rules.length > 0 ? `\n${rules.map(r => `    - ${r}`).join('\n')}` : ' []';
      const agentLines = agents.length > 0 ? `\n${agents.map(a => `    - ${a}`).join('\n')}` : ' []';
      usesBlock = `uses:\n  rules:${ruleLines}\n  agents:${agentLines}`;
    }
    // Insert uses block before tags (last entry)
    yamlLines.splice(yamlLines.length - 1, 0, usesBlock);
  }
  const yaml = yamlLines.join('\n');

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

/**
 * Build an ImportPlan from a list of discovered files.
 *
 * @param discovered  Output from discoverFiles().discovered
 * @param opts        Language/catalog context
 */
export function buildImportPlan(discovered: DiscoveredFile[], opts: PlanOptions): ImportPlan {
  const items: ImportItem[] = [];
  const droppedFieldsSummary: ImportPlan['droppedFieldsSummary'] = [];

  for (const file of discovered) {
    const { frontmatter: translated, droppedFields, bodyPrefix, descriptionSynthesized } =
      translateFrontmatter(file.kind, file.slug, file.frontmatter, {
        language: opts.language,
        displayName: opts.displayName,
      });

    const destPath = computeDestinationPath(translated.id, file.kind, opts.catalogDir);

    // Prepend body prefix (e.g. ## When to Use section from skill's when_to_use field)
    const body = bodyPrefix ? `${bodyPrefix}${file.body.trimStart()}` : file.body;

    const item: ImportItem = {
      sourcePath: file.sourcePath,
      relativePath: file.relativePath,
      frontmatter: translated,
      body,
      destPath,
      droppedFields,
      conflicts: fs.existsSync(destPath),
      descriptionSynthesized,
    };

    items.push(item);

    if (droppedFields.length > 0) {
      droppedFieldsSummary.push({ relativePath: file.relativePath, fields: droppedFields });
    }
  }

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
