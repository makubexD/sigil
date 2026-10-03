/**
 * Loads a skill's `references/` files. They ship verbatim to every project that installs the skill,
 * so only plain Markdown files with kebab-case names and a bounded size are taken, from a real
 * folder: no symbolic link (or Windows junction) is followed, for the folder or a file. Each file
 * is opened once and checked on that open handle, so it can't be swapped between check and read.
 * Anything else is skipped with a load warning (printed by every command), so one bad file never
 * stops a catalog from loading; `validate` then flags a skill that still mentions the skipped file.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ReferenceFile } from './types';

const KIB = 1024;
/** One reference file larger than this many KiB is skipped. */
const MAX_REFERENCE_KIB = 256;
/** References past this many KiB in total for one skill are skipped. */
const MAX_SKILL_REFERENCE_KIB = 1024;
const MAX_REFERENCE_BYTES = MAX_REFERENCE_KIB * KIB;
const MAX_SKILL_REFERENCE_BYTES = MAX_SKILL_REFERENCE_KIB * KIB;
/** Reference names become output paths, so they are held to the same shape as artifact names. */
const REFERENCE_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
/** Refuses a symbolic link at open time where the platform supports it (not on Windows). */
const OPEN_FLAGS = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
const NOT_FOLLOWED = 'symbolic links are not followed';

type ReadOutcome = { content: string } | { reason: string };

const NOT_REGULAR: ReadOutcome = { reason: `not a regular file (${NOT_FOLLOWED})` };

/** Opens `file` for reading without following a link; undefined when it is a link or can't open. */
function openNoFollow(file: string): number | undefined {
  if (!fs.lstatSync(file).isFile()) return undefined;
  try {
    return fs.openSync(file, OPEN_FLAGS);
  } catch {
    return undefined;
  }
}

/** Checks and reads an open file: regular, within the per-file cap and the remaining `budget`. */
function readOpened(fd: number, budget: number): ReadOutcome {
  const stat = fs.fstatSync(fd);
  if (!stat.isFile()) return NOT_REGULAR;
  if (stat.size > MAX_REFERENCE_BYTES) return { reason: `larger than ${MAX_REFERENCE_KIB} KiB` };
  if (stat.size > budget) {
    return {
      reason: `the skill's references would exceed ${MAX_SKILL_REFERENCE_KIB} KiB in total`,
    };
  }
  const buffer = Buffer.alloc(stat.size);
  const read = fs.readSync(fd, buffer, 0, stat.size, 0);
  return { content: buffer.subarray(0, read).toString('utf-8') };
}

/** Reads `file` through one open handle: a regular, non-link file within `budget` bytes. */
function readRegularFile(file: string, budget: number): ReadOutcome {
  const fd = openNoFollow(file);
  if (fd === undefined) return NOT_REGULAR;
  try {
    return readOpened(fd, budget);
  } finally {
    fs.closeSync(fd);
  }
}

/** One references/ entry the loader did not take, and why. */
export interface SkippedReference {
  readonly path: string;
  readonly reason: string;
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
    }
  }
  return { names: names.sort(), skipped };
}

/** The references/ folder's stat when it is a real folder, else why it is skipped (or nothing). */
function folderProblem(refsDir: string): SkippedReference | 'absent' | undefined {
  const stat = fs.lstatSync(refsDir, { throwIfNoEntry: false });
  if (!stat) return 'absent';
  if (stat.isDirectory()) return undefined;
  return { path: refsDir, reason: `not a real folder (${NOT_FOLLOWED})` };
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

/** Reads each named file within the per-skill budget; records the ones it skips in `skipped`. */
function readNamed(refsDir: string, names: string[], skipped: SkippedReference[]): ReferenceFile[] {
  const references: ReferenceFile[] = [];
  let total = 0;
  for (const name of names) {
    const file = path.join(refsDir, name);
    const outcome = REFERENCE_NAME_RE.test(name)
      ? readRegularFile(file, MAX_SKILL_REFERENCE_BYTES - total)
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

/** The loader's form of readReferences: skipped entries become load warnings. */
export function loadReferences(skillDir: string, warnings: string[]): ReferenceFile[] {
  const { references, skipped } = readReferences(skillDir);
  for (const s of skipped) warnings.push(`[load] Skipping reference ${s.path}: ${s.reason}`);
  return references;
}
