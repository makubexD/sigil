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

/** The .md entries of a references/ folder, in name order. */
function markdownNames(refsDir: string): string[] {
  return fs
    .readdirSync(refsDir)
    .filter(f => f.endsWith('.md'))
    .sort();
}

/** Whether `refsDir` is a real folder to read from; reports anything else in `warnings`. */
function isRealFolder(refsDir: string, warnings: string[]): boolean {
  const stat = fs.lstatSync(refsDir, { throwIfNoEntry: false });
  if (!stat) return false;
  if (stat.isDirectory()) return true;
  warnings.push(`[load] Skipping references ${refsDir}: not a real folder (${NOT_FOLLOWED})`);
  return false;
}

/**
 * Reads `<skillDir>/references/*.md` in name order. Skipped files are reported in `warnings`.
 */
export function loadReferences(skillDir: string, warnings: string[]): ReferenceFile[] {
  const refsDir = path.join(skillDir, 'references');
  if (!isRealFolder(refsDir, warnings)) return [];

  const references: ReferenceFile[] = [];
  let total = 0;
  for (const name of markdownNames(refsDir)) {
    const file = path.join(refsDir, name);
    const outcome = REFERENCE_NAME_RE.test(name)
      ? readRegularFile(file, MAX_SKILL_REFERENCE_BYTES - total)
      : { reason: 'name is not kebab-case Markdown (e.g. stack-go.md)' };
    if ('reason' in outcome) {
      warnings.push(`[load] Skipping reference ${file}: ${outcome.reason}`);
      continue;
    }
    total += Buffer.byteLength(outcome.content);
    references.push({ name, content: outcome.content });
  }
  return references;
}
