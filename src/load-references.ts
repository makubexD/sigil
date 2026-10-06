/**
 * Loads a skill's `references/` files, and lists everything in a skill folder that never ships.
 * References ship verbatim to every project that installs the skill, so only plain Markdown files
 * with kebab-case names and a bounded size are taken, from a real folder, each read through
 * safe-read.ts (no symbolic link is followed, for the folder or a file). Anything else is skipped
 * with a reason: the loader turns those into load warnings (printed by every command) so one bad
 * file never stops a catalog from loading, `sigil import` lists them as not imported, and the
 * `catalog-layout` rule fails `sync --check` on them. All three read the same lists from here.
 *
 * A shared skill's per-stack text lives in the language that owns the stack, as a stack part
 * (`languages/<lang>/stack-parts/<skill>.md`): `shared/` holds only language-neutral text. The
 * loader puts each part back into the skill as `references/stack-<stack>.md`, read with the same
 * rules and the same per-skill budget, so every target ships what it shipped before.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { globSync } from 'tinyglobby';
import type { LanguageMetadata, ReferenceFile } from './types';
import { readRegularFile } from './safe-read';
import { SKILL_FILENAME } from './paths';
import { LANGUAGES_DIR } from './catalog-layout';

/** The folder in a language that holds its stack parts. */
export const STACK_PARTS_DIR = 'stack-parts';

const KIB = 1024;
/** One reference file larger than this many KiB is skipped. */
const MAX_REFERENCE_KIB = 256;
/** References past this many KiB in total for one skill are skipped. */
const MAX_SKILL_REFERENCE_KIB = 1024;
const MAX_REFERENCE_BYTES = MAX_REFERENCE_KIB * KIB;
const MAX_SKILL_REFERENCE_BYTES = MAX_SKILL_REFERENCE_KIB * KIB;
/** Reference names become output paths, so they are held to the same shape as artifact names. */
const REFERENCE_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
/** The only entries of a skill folder that ship. */
const SHIPPED_SKILL_ENTRIES = new Set([SKILL_FILENAME, 'references']);
const NOT_SHIPPED =
  'never ships: a skill ships only SKILL.md and flat references/*.md (flatten per-stack folders into references/stack-<x>.md)';

/** One entry a skill folder carries that does not ship, and why. */
export interface SkippedReference {
  readonly path: string;
  readonly reason: string;
}

/** A stack part found in a language: the reference name it ships as, and its file. */
export interface StackPart {
  /** `stack-<stack>.md`, the stack of the language folder it sits in. */
  readonly name: string;
  readonly file: string;
  readonly language: string;
  readonly stack: string;
}

/**
 * Every language's stack parts, keyed by the shared skill they belong to (the part's file name).
 * A part in a language that names no stack is skipped and reported.
 */
export function stackPartsBySkill(
  catalogDir: string,
  languages: ReadonlyMap<string, LanguageMetadata>,
): { parts: Map<string, StackPart[]>; skipped: SkippedReference[] } {
  const parts = new Map<string, StackPart[]>();
  const skipped: SkippedReference[] = [];
  const pattern = `${LANGUAGES_DIR}/*/${STACK_PARTS_DIR}/*.md`;
  const files = globSync(pattern, { cwd: catalogDir, absolute: true, followSymbolicLinks: false });
  for (const file of files.sort().map(f => path.normalize(f))) {
    const part = partOf(file, languages);
    if ('reason' in part) {
      skipped.push(part);
      continue;
    }
    const skill = path.basename(file, '.md');
    parts.set(skill, [...(parts.get(skill) ?? []), part]);
  }
  return { parts, skipped };
}

/** The part `file` is, from its language folder's stack, or why it is skipped. */
function partOf(
  file: string,
  languages: ReadonlyMap<string, LanguageMetadata>,
): StackPart | SkippedReference {
  const language = path.basename(path.dirname(path.dirname(file)));
  const stack = languages.get(language)?.stack;
  if (!stack) return { path: file, reason: `language '${language}' names no stack` };
  return { name: `stack-${stack}.md`, file, language, stack };
}

/** Entries of a skill folder besides SKILL.md and references/, which no target ships. */
export function skillFolderExtras(skillDir: string): SkippedReference[] {
  return fs
    .readdirSync(skillDir)
    .filter(name => !SHIPPED_SKILL_ENTRIES.has(name))
    .map(name => ({ path: path.join(skillDir, name), reason: NOT_SHIPPED }));
}

/** The entries of a real references/ folder: .md files to consider, and anything else to report. */
function listEntries(refsDir: string): { names: string[]; skipped: SkippedReference[] } {
  const names: string[] = [];
  const skipped: SkippedReference[] = [];
  for (const entry of fs.readdirSync(refsDir, { withFileTypes: true })) {
    const entryPath = path.join(refsDir, entry.name);
    if (entry.isDirectory()) {
      skipped.push({ path: entryPath, reason: 'nested folder (references stay one level deep)' });
    } else if (entry.name.endsWith('.md')) {
      names.push(entry.name);
    } else {
      skipped.push({ path: entryPath, reason: 'not a Markdown file (only references/*.md ship)' });
    }
  }
  return { names: names.sort(), skipped };
}

/** Why the references/ folder is skipped, 'absent' when there is none, undefined when it is fine. */
function folderProblem(refsDir: string): SkippedReference | 'absent' | undefined {
  const stat = fs.lstatSync(refsDir, { throwIfNoEntry: false });
  if (!stat) return 'absent';
  if (stat.isDirectory()) return undefined;
  return { path: refsDir, reason: 'not a real folder (symbolic links are not followed)' };
}

/** The read limit for the next reference: the per-file cap, or what is left of the skill's total. */
function limitFor(total: number) {
  const remaining = MAX_SKILL_REFERENCE_BYTES - total;
  return {
    maxBytes: Math.min(MAX_REFERENCE_BYTES, remaining),
    tooLarge: (size: number) =>
      size > MAX_REFERENCE_BYTES
        ? `larger than ${MAX_REFERENCE_KIB} KiB`
        : `the skill's references would exceed ${MAX_SKILL_REFERENCE_KIB} KiB in total`,
  };
}

/** Reads each entry within the per-skill budget; records the ones it skips in `skipped`. */
function readNamed(
  entries: ReadonlyArray<{ name: string; file: string }>,
  skipped: SkippedReference[],
): ReferenceFile[] {
  const references: ReferenceFile[] = [];
  let total = 0;
  for (const { name, file } of entries) {
    const outcome = REFERENCE_NAME_RE.test(name)
      ? readRegularFile(file, limitFor(total))
      : { reason: 'name is not kebab-case Markdown (e.g. stack-go.md)' };
    if ('reason' in outcome) {
      skipped.push({ path: file, reason: outcome.reason });
      continue;
    }
    total += Buffer.byteLength(outcome.content);
    references.push({ name, content: outcome.content, sourcePath: file });
  }
  return references;
}

/** The skill's own reference files, or why its references/ folder is skipped. */
function ownEntries(skillDir: string): {
  entries: Array<{ name: string; file: string }>;
  skipped: SkippedReference[];
} {
  const refsDir = path.join(skillDir, 'references');
  const problem = folderProblem(refsDir);
  if (problem === 'absent') return { entries: [], skipped: [] };
  if (problem) return { entries: [], skipped: [problem] };
  const { names, skipped } = listEntries(refsDir);
  return { entries: names.map(name => ({ name, file: path.join(refsDir, name) })), skipped };
}

/**
 * Reads `<skillDir>/references/*.md` plus the skill's stack `parts`, in name order, and reports
 * every entry it did not take (a part the skill already has a file for is one). Shared by the
 * catalog loader and `sigil import`, so both ship exactly the same files.
 */
export function readReferences(
  skillDir: string,
  parts: readonly StackPart[] = [],
): { references: ReferenceFile[]; skipped: SkippedReference[] } {
  const { entries, skipped } = ownEntries(skillDir);
  const own = new Set(entries.map(entry => entry.name));
  for (const part of parts) {
    if (own.has(part.name)) {
      skipped.push({ path: part.file, reason: `the skill already has references/${part.name}` });
    } else {
      entries.push({ name: part.name, file: part.file });
    }
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { references: readNamed(entries, skipped), skipped };
}

/** The loader's form of readReferences: skipped entries become load warnings. */
export function loadReferences(
  skillDir: string,
  warnings: string[],
  parts: readonly StackPart[] = [],
): ReferenceFile[] {
  const { references, skipped } = readReferences(skillDir, parts);
  for (const s of skipped) warnings.push(`[load] Skipping reference ${s.path}: ${s.reason}`);
  return references;
}
