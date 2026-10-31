/**
 * Normalise GitHub Copilot frontmatter into the shape the per-kind translators read.
 *
 * Pure: no filesystem access. `translate-kinds.ts` stays unchanged; `sigil import` calls these
 * before translating a Copilot source file. Notes and refusals are user-facing text.
 *
 * @module
 */
import { splitToolsString } from './translate-helpers';

/** Result of normalising one source file's frontmatter. */
export interface NormalizedFields {
  frontmatter: Record<string, unknown>;
  notes: string[];
  refused?: string | undefined;
}

const NO_APPLY_TO_NOTE = 'no applyTo in source; imported as **/*, which applies to every file';
const WILDCARD_TOOLS_NOTE = "tools ['*'] removed: an absent list already means all tools";
const EMPTY_TOOLS_REFUSAL = 'tools is empty, and an absent list would grant every tool';

/** Turn a source file stem into a catalog slug, dropping the language namespace prefix. */
export function copilotSlug(stem: string, namespace?: string): string {
  let slug = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (namespace && slug.startsWith(`${namespace}-`)) {
    slug = slug.slice(namespace.length + 1);
  }
  return slug;
}

/** Split a comma-separated glob list, ignoring commas inside `{…}` groups. */
export function splitGlobList(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of raw) {
    if (char === '{') depth += 1;
    if (char === '}') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map(part => part.trim()).filter(Boolean);
}

/** Copy the frontmatter and collapse whitespace runs in a string `description`. */
function normalizeDescription(fm: Record<string, unknown>): Record<string, unknown> {
  const frontmatter = { ...fm };
  if (typeof frontmatter.description === 'string') {
    frontmatter.description = frontmatter.description.replace(/\s+/g, ' ').trim();
  }
  return frontmatter;
}

/** Turn an `applyTo` value (string or string list) into a glob array. */
function globListFrom(raw: unknown): string[] {
  if (typeof raw === 'string') return splitGlobList(raw);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);
}

/** Remove `name`, noting a source name that differs from the catalog slug. */
function dropName(fm: Record<string, unknown>, slug: string, notes: string[]): void {
  if ('name' in fm && fm.name !== slug) {
    notes.push(
      `name '${String(fm.name)}' not kept; the catalog name is '${slug}' (from the file name)`,
    );
  }
  delete fm.name;
}

/** Normalise a `.instructions.md` source: `applyTo` becomes `paths`. */
export function normalizeRuleFields(fm: Record<string, unknown>): NormalizedFields {
  const frontmatter = normalizeDescription(fm);
  const notes: string[] = [];
  const globs = globListFrom(frontmatter.applyTo);
  delete frontmatter.applyTo;
  if (globs.length > 0) frontmatter.paths = globs;
  else notes.push(NO_APPLY_TO_NOTE);
  return { frontmatter, notes };
}

/** Apply an agent's tools list, returning a refusal reason when the list is empty. */
function applyAgentTools(
  frontmatter: Record<string, unknown>,
  tools: string[],
  notes: string[],
): string | undefined {
  if (tools.length === 0) return EMPTY_TOOLS_REFUSAL;
  if (tools.length === 1 && tools[0] === '*') {
    delete frontmatter.tools;
    notes.push(WILDCARD_TOOLS_NOTE);
    return undefined;
  }
  frontmatter.tools = tools;
  return undefined;
}

/** Normalise a `.agent.md` source: `name` from the slug, tools read in every written form. */
export function normalizeAgentFields(fm: Record<string, unknown>, slug: string): NormalizedFields {
  const frontmatter = normalizeDescription(fm);
  const notes: string[] = [];
  dropName(frontmatter, slug, notes);
  frontmatter.name = slug;
  const refused =
    'tools' in frontmatter
      ? applyAgentTools(frontmatter, splitToolsString(frontmatter.tools), notes)
      : undefined;
  return refused === undefined ? { frontmatter, notes } : { frontmatter, notes, refused };
}

/** Split a skill's `allowed-tools` string on whitespace or commas. */
function splitAllowedTools(raw: string): string[] {
  return raw.split(/[\s,]+/).filter(Boolean);
}

/** Normalise a Copilot `SKILL.md` source: `name` dropped, `allowed-tools` as an array. */
export function normalizeSkillFields(fm: Record<string, unknown>, slug: string): NormalizedFields {
  const frontmatter = normalizeDescription(fm);
  const notes: string[] = [];
  dropName(frontmatter, slug, notes);
  if (typeof frontmatter['allowed-tools'] === 'string') {
    frontmatter['allowed-tools'] = splitAllowedTools(frontmatter['allowed-tools']);
  }
  return { frontmatter, notes };
}
