/**
 * Keeps `catalog/standard.yaml` in step with `sigil move`: a family lists its members by id, so a
 * moved artifact's old id would otherwise stay listed and `sync --check` (family-skeleton) would
 * report it as missing from the catalog. The file is rewritten as text so its comments survive.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { STANDARD_FILE } from '../../catalog-standard';
import { readRegularFile } from '../../safe-read';

const KIB = 1024;
const MAX_STANDARD_KIB = 256;

/** `text` with every whole-id occurrence of `oldId` replaced by `newId` (`a/b` never hits `a/bc`). */
export function renameStandardMember(text: string, oldId: string, newId: string): string {
  const escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(?<![A-Za-z0-9_/-])${escaped}(?![A-Za-z0-9_/-])`, 'g'), newId);
}

/**
 * Renames `oldId` to `newId` in `<catalogDir>/standard.yaml`, recording a rollback step first and
 * adding the file to `changed`. Returns the file path when it changed, or undefined when there is
 * no file or no mention.
 */
export function moveStandardMember(
  catalogDir: string,
  ids: { readonly oldId: string; readonly newId: string },
  rollbackSteps: Array<() => void>,
  changed: string[] = [],
): string | undefined {
  const file = path.join(catalogDir, STANDARD_FILE);
  if (!fs.existsSync(file)) return undefined;
  const read = readRegularFile(file, { maxBytes: MAX_STANDARD_KIB * KIB });
  if ('reason' in read) throw new Error(`[move] ${file}: ${read.reason}`);
  const next = renameStandardMember(read.content, ids.oldId, ids.newId);
  if (next === read.content) return undefined;
  rollbackSteps.push(() => fs.writeFileSync(file, read.content, 'utf-8'));
  fs.writeFileSync(file, next, 'utf-8');
  changed.push(file);
  return file;
}
