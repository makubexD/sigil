/**
 * `sigil delete <id>` command — remove an artifact from the catalog source.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { confirm, isCancel, cancel, note } from '@clack/prompts';
import { resolveCatalog } from '../resolve';
import { isInteractiveTTY } from '../wizard';
import { hasUsesClosure, isDirectoryBacked } from '../kinds';
import { SigilError } from '../errors';
import { requireArtifact } from './shared/artifact';
import { requireValidCatalog } from '../cli-helpers';
import type { ResolvedCatalog } from '../types';

export interface DeleteOptions {
  catalogDir: string;
  yes?: boolean;
  dryRun?: boolean;
}

/** Finds skills whose resolved `uses.rules`/`uses.agents` closure includes `id`. */
function findDependents(resolvedCatalog: ResolvedCatalog, id: string): string[] {
  const dependents: string[] = [];
  for (const a of resolvedCatalog.artifacts) {
    if (!hasUsesClosure(a.kind)) continue;
    const usesRule = (a.resolvedRules ?? []).some(r => r.id === id);
    const usesAgent = (a.resolvedAgentIds ?? []).includes(id);
    if (usesRule || usesAgent) {
      dependents.push(a.id);
    }
  }
  return dependents;
}

/** Prints the `--dry-run` preview of what would be deleted. */
function printDryRunPreview(isSkill: boolean, targetPath: string, dependents: string[]): void {
  console.log(`\nDry run — would delete:`);
  console.log(`  ${isSkill ? '(directory) ' : ''}${targetPath}`);
  if (dependents.length > 0) {
    console.warn(`\n  ⚠  ${dependents.length} skill(s) reference this artifact via \`uses:\`:`);
    for (const dep of dependents) console.warn(`     ${dep}`);
    console.warn(`  Update their uses: declarations after deleting.`);
  }
  console.log('\nNo files were deleted (--dry-run).');
}

/** Prints the "N skill(s) reference ... via uses:" note box when there are dependents. */
function printDependentsNote(id: string, dependents: string[]): void {
  if (dependents.length === 0) return;
  note(
    `${dependents.length} skill(s) reference '${id}' via their uses: declarations:\n` +
      dependents.map(dep => `  ${dep}`).join('\n') +
      '\n' +
      '\nThose skills will have dangling references after deletion.\n' +
      'Update their uses: frontmatter before running `sigil validate`.',
    '⚠  Dependent artifacts',
  );
}

/** Prompts to confirm the deletion (skipped when --yes). Returns false if cancelled. */
async function promptDeleteConfirmation(isSkill: boolean, targetPath: string): Promise<boolean> {
  const confirmed = await confirm({
    message: `Delete ${isSkill ? 'skill directory' : 'file'}: ${targetPath}?`,
    initialValue: false,
  });
  if (isCancel(confirmed) || !confirmed) {
    cancel('Delete cancelled.');
    return false;
  }
  return true;
}

/** The target-artifact details needed by {@link confirmDelete} beyond `id`/`opts`. */
interface DeleteTarget {
  isSkill: boolean;
  targetPath: string;
  dependents: string[];
}

/** Warns about dependents, then confirms the deletion unless --yes was passed. Returns
 * true to proceed, false if the user cancelled. Throws if non-interactive without --yes. */
async function confirmDelete(
  id: string,
  target: DeleteTarget,
  opts: DeleteOptions,
): Promise<boolean> {
  const { isSkill, targetPath, dependents } = target;
  if (!opts.yes && !isInteractiveTTY()) {
    throw new SigilError('stdin/stdout is not an interactive terminal.', {
      hint: `  Re-run with --yes to confirm deletion: sigil delete ${id} --yes`,
    });
  }

  printDependentsNote(id, dependents);

  if (!opts.yes) return promptDeleteConfirmation(isSkill, targetPath);
  return true;
}

/** Deletes the target (directory for skills, single file otherwise). */
function deleteTarget(isSkill: boolean, targetPath: string): void {
  if (isSkill) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } else {
    fs.unlinkSync(targetPath);
  }
}

/** Prints the post-delete success line + dependent-update reminder + next-step hint. */
function printDeleteSuccess(targetPath: string, dependents: string[]): void {
  console.log(`✓ Deleted: ${targetPath}`);
  if (dependents.length > 0) {
    console.warn(`  ⚠  Update uses: in: ${dependents.join(', ')}`);
  }
  console.log(`  Next: npm run validate  (to confirm catalog integrity)`);
}

/** Determines whether the artifact is directory-backed (skill) and its removal target path. */
function computeDeletionTarget(artifact: { kind: string; filePath: string }): {
  isSkill: boolean;
  targetPath: string;
} {
  const isSkill = isDirectoryBacked(artifact.kind);
  const targetPath = isSkill
    ? path.dirname(artifact.filePath) // remove the whole skill directory
    : artifact.filePath; // remove the single file
  return { isSkill, targetPath };
}

export async function runDelete(id: string, opts: DeleteOptions): Promise<void> {
  const rawCatalog = await requireValidCatalog(opts.catalogDir);
  const resolvedCatalog = resolveCatalog(rawCatalog);

  const artifact = requireArtifact(
    rawCatalog.byId,
    rawCatalog.artifacts.map(a => a.id),
    id,
  );

  const dependents = findDependents(resolvedCatalog, id);
  const { isSkill, targetPath } = computeDeletionTarget(artifact);

  if (opts.dryRun) {
    printDryRunPreview(isSkill, targetPath, dependents);
    return;
  }

  const proceed = await confirmDelete(id, { isSkill, targetPath, dependents }, opts);
  if (!proceed) return;

  deleteTarget(isSkill, targetPath);
  printDeleteSuccess(targetPath, dependents);
}
