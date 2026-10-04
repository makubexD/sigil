/**
 * Loads a skill's `references/` files, and lists everything in a skill folder that never ships.
 * References ship verbatim to every project that installs the skill, so only plain Markdown files
 * with kebab-case names and a bounded size are taken, from a real folder, each read through
 * safe-read.ts (no symbolic link is followed, for the folder or a file). Anything else is skipped
 * with a reason: the loader turns those into load warnings (printed by every command) so one bad
 * file never stops a catalog from loading, `sigil import` lists them as not imported, and the
 * `catalog-layout` rule fails `sync --check` on them. All three read the same lists from here.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ReferenceFile } from './types';
import { readRegularFile } from './safe-read';
import { SKILL_FILENAME } from './paths';

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

/** Reads each named file within the per-skill budget; records the ones it skips in `skipped`. */
function readNamed(refsDir: string, names: string[], skipped: SkippedReference[]): ReferenceFile[] {
  const references: ReferenceFile[] = [];
  let total = 0;
  for (const name of names) {
    const file = path.join(refsDir, name);
    const outcome = REFERENCE_NAME_RE.test(name)
      ? readRegularFile(file, limitFor(total))
      : { reason: 'name is not kebab-case Markdown (e.g. stack-go.md)' };
    if ('reason' in outcome) {
      skipped.push({ path: file, reason: outcome.reason });
      continue;
    }
    total += Buffer.byteLength(outcome.content);
    references.push({ name, content: outcome.content });
  }
  return references;
}

/**
 * Reads `<skillDir>/references/*.md` in name order, and reports every entry it did not take.
 * Shared by the catalog loader and `sigil import`, so both ship exactly the same files.
 */
export function readReferences(skillDir: string): {
  references: ReferenceFile[];
  skipped: SkippedReference[];
} {
  const refsDir = path.join(skillDir, 'references');
  const problem = folderProblem(refsDir);
  if (problem === 'absent') return { references: [], skipped: [] };
  if (problem) return { references: [], skipped: [problem] };

  const { names, skipped } = listEntries(refsDir);
  return { references: readNamed(refsDir, names, skipped), skipped };
}

/** The loader's form of readReferences: skipped entries become load warnings. */
export function loadReferences(skillDir: string, warnings: string[]): ReferenceFile[] {
  const { references, skipped } = readReferences(skillDir);
  for (const s of skipped) warnings.push(`[load] Skipping reference ${s.path}: ${s.reason}`);
  return references;
}
