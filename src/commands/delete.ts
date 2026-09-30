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

export interface DeleteOptions {
  catalogDir: string;
  yes?: boolean;
  dryRun?: boolean;
}

export async function runDelete(id: string, opts: DeleteOptions): Promise<void> {
  const rawCatalog = await requireValidCatalog(opts.catalogDir);
  const resolvedCatalog = resolveCatalog(rawCatalog);

  const artifact = requireArtifact(
    rawCatalog.byId,
    rawCatalog.artifacts.map(a => a.id),
    id,
  );

  // ── Reverse-dependency scan ─────────────────────────────────────────────────
  // Find skills whose resolved rules or agent IDs include this artifact.
  const dependents: string[] = [];
  for (const a of resolvedCatalog.artifacts) {
    if (!hasUsesClosure(a.kind)) continue;
    const usesRule = (a.resolvedRules ?? []).some(r => r.id === id);
    const usesAgent = (a.resolvedAgentIds ?? []).includes(id);
    if (usesRule || usesAgent) {
      dependents.push(a.id);
    }
  }

  // Determine what will be removed
  const isSkill = isDirectoryBacked(artifact.kind);
  const targetPath = isSkill
    ? path.dirname(artifact.filePath) // remove the whole skill directory
    : artifact.filePath; // remove the single file

  if (opts.dryRun) {
    console.log(`\nDry run — would delete:`);
    console.log(`  ${isSkill ? '(directory) ' : ''}${targetPath}`);
    if (dependents.length > 0) {
      console.warn(`\n  ⚠  ${dependents.length} skill(s) reference this artifact via \`uses:\`:`);
      for (const dep of dependents) console.warn(`     ${dep}`);
      console.warn(`  Update their uses: declarations after deleting.`);
    }
    console.log('\nNo files were deleted (--dry-run).');
    return;
  }

  // ── Confirmation ────────────────────────────────────────────────────────────
  const isTTY = isInteractiveTTY();

  if (!opts.yes && !isTTY) {
    throw new SigilError('stdin/stdout is not an interactive terminal.', {
      hint: `  Re-run with --yes to confirm deletion: sigil delete ${id} --yes`,
    });
  }

  if (dependents.length > 0) {
    note(
      `${dependents.length} skill(s) reference '${id}' via their uses: declarations:\n` +
        dependents.map(dep => `  ${dep}`).join('\n') +
        '\n' +
        '\nThose skills will have dangling references after deletion.\n' +
        'Update their uses: frontmatter before running `sigil validate`.',
      '⚠  Dependent artifacts',
    );
  }

  if (!opts.yes) {
    const confirmed = await confirm({
      message: `Delete ${isSkill ? 'skill directory' : 'file'}: ${targetPath}?`,
      initialValue: false,
    });
    if (isCancel(confirmed) || !confirmed) {
      cancel('Delete cancelled.');
      return;
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  if (isSkill) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } else {
    fs.unlinkSync(targetPath);
  }

  console.log(`✓ Deleted: ${targetPath}`);
  if (dependents.length > 0) {
    console.warn(`  ⚠  Update uses: in: ${dependents.join(', ')}`);
  }
  console.log(`  Next: npm run validate  (to confirm catalog integrity)`);
}
