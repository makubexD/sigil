/**
 * Loads a skill's `references/` files. They ship verbatim to every project that installs the skill,
 * so only plain Markdown files with kebab-case names and a bounded size are taken. Anything else is
 * skipped with a load warning (printed by every command), so one bad file never stops a catalog from
 * loading; `validate` then flags a skill that still mentions the skipped file.
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

/** Why `name` (an entry of a references/ folder) is not loaded, or undefined when it is fine. */
function rejection(refsDir: string, name: string, total: number): string | undefined {
  const stat = fs.lstatSync(path.join(refsDir, name));
  if (!stat.isFile()) return 'not a regular file (symbolic links are not followed)';
  if (!REFERENCE_NAME_RE.test(name)) return 'name is not kebab-case Markdown (e.g. stack-go.md)';
  if (stat.size > MAX_REFERENCE_BYTES) return `larger than ${MAX_REFERENCE_KIB} KiB`;
  if (total + stat.size > MAX_SKILL_REFERENCE_BYTES) {
    return `the skill's references would exceed ${MAX_SKILL_REFERENCE_KIB} KiB in total`;
  }
  return undefined;
}

/** The .md entries of a references/ folder, in name order. */
function markdownNames(refsDir: string): string[] {
  return fs
    .readdirSync(refsDir)
    .filter(f => f.endsWith('.md'))
    .sort();
}

/**
 * Reads `<skillDir>/references/*.md` in name order. Skipped files are reported in `warnings`.
 */
export function loadReferences(skillDir: string, warnings: string[]): ReferenceFile[] {
  const refsDir = path.join(skillDir, 'references');
  if (!fs.existsSync(refsDir)) return [];

  const references: ReferenceFile[] = [];
  let total = 0;
  for (const name of markdownNames(refsDir)) {
    const reason = rejection(refsDir, name, total);
    if (reason) {
      warnings.push(`[load] Skipping reference ${path.join(refsDir, name)}: ${reason}`);
      continue;
    }
    const content = fs.readFileSync(path.join(refsDir, name), 'utf-8');
    total += Buffer.byteLength(content);
    references.push({ name, content });
  }
  return references;
}
