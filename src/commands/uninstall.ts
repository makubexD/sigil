/**
 * `sigil uninstall <ids...>` command — remove installed artifacts from a consumer project.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { confirm, isCancel, cancel, note } from '@clack/prompts';
import { detectProjectTarget } from '../cli-helpers';
import { loadManifest, saveManifest, removeEntries, sha256 } from '../manifest';
import { resolveConfigRoot } from '../config-utils';
import { reverseMerge, serialize } from '../config-merge';
import { CONFIG_KINDS } from '../select';
import { isInteractiveTTY } from '../wizard';
import type { ConfigRoot, ConfigMergeOp, MergeStrategy } from '../types';
import { SigilError } from '../errors';

export interface UninstallOptions {
  projectDir: string;
  target?: string | undefined;
  yes: boolean;
  force: boolean;
  dryRun: boolean;
}

export async function runUninstall(ids: string[], opts: UninstallOptions): Promise<void> {
  const targetName = opts.target ?? detectProjectTarget(opts.projectDir, { verbose: false });

  let manifest;
  try {
    manifest = loadManifest(opts.projectDir);
  } catch (err) {
    throw new SigilError((err as Error).message, { cause: err });
  }

  // Validate all ids exist in the manifest for this target
  const notFound = ids.filter(
    id => !manifest.entries.some(e => e.id === id && e.target === targetName),
  );
  if (notFound.length > 0) {
    throw new SigilError(`Not installed (target '${targetName}'): ${notFound.join(', ')}`, {
      hint: '  Run `sigil status` to see installed artifacts.',
    });
  }

  const { pathsToDelete, removedEntries } = removeEntries(manifest, ids, targetName);

  // Separate config entries (need reverseMerge) from whole-file entries
  const configEntriesToRemove = removedEntries.filter(
    e => CONFIG_KINDS.has(e.kind) && e.configFiles && e.configFiles.length > 0,
  );

  // Check for drifted files (whole-file entries only)
  const driftedPaths: string[] = [];
  for (const p of pathsToDelete) {
    const fullPath = path.join(opts.projectDir, p);
    if (!fs.existsSync(fullPath)) continue;
    // Find the recorded hash for this file
    const recorded = removedEntries.flatMap(e => e.files).find(f => f.path === p);
    if (recorded) {
      const diskHash = sha256(fs.readFileSync(fullPath, 'utf-8'));
      if (diskHash !== recorded.sha256) driftedPaths.push(p);
    }
  }

  if (opts.dryRun) {
    console.log(
      `\nDry run — would remove ${pathsToDelete.length} file(s) and reverse ${configEntriesToRemove.length} JSON merge(s):`,
    );
    for (const p of pathsToDelete) {
      const drifted = driftedPaths.includes(p);
      console.log(`  - ${p}${drifted ? '  (drifted)' : ''}`);
    }
    for (const e of configEntriesToRemove) {
      for (const cf of e.configFiles ?? []) {
        console.log(`  ~ ${cf.file}  (JSON reverse-merge for ${e.id})`);
      }
    }
    console.log('\nNo files were removed (--dry-run).');
    return;
  }

  // Prompt if there are drifted files and not --force
  if (driftedPaths.length > 0 && !opts.force) {
    note(
      `${driftedPaths.length} file(s) were modified after install:\n` +
        driftedPaths.map(p => `  ${p}`).join('\n') +
        '\n\nThey will NOT be deleted. Use --force to remove them anyway.',
      '⚠  Drifted files',
    );
  }

  // Confirm
  const isTTY = isInteractiveTTY();
  if (!opts.yes && !isTTY) {
    throw new SigilError('stdin/stdout is not interactive. Re-run with --yes to confirm.');
  }
  if (!opts.yes) {
    const ok = await confirm({
      message: `Remove ${ids.join(', ')} from '${targetName}'?`,
      initialValue: false,
    });
    if (isCancel(ok) || !ok) {
      cancel('Uninstall cancelled.');
      return;
    }
  }

  // Delete whole-file kind files
  for (const p of pathsToDelete) {
    if (driftedPaths.includes(p) && !opts.force) continue;
    const fullPath = path.join(opts.projectDir, p);
    try {
      fs.unlinkSync(fullPath);
      // Remove empty parent directories (best-effort)
      const dir = path.dirname(fullPath);
      if (fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
      }
    } catch {
      // If file was already missing, that's fine
    }
  }

  // Reverse-merge config entries
  let configRemovedCount = 0;
  for (const entry of configEntriesToRemove) {
    for (const cf of entry.configFiles ?? []) {
      const rootDir = resolveConfigRoot(
        (cf.root as ConfigRoot | undefined) ?? 'project',
        opts.projectDir,
      );
      const fullPath = path.join(rootDir, cf.file);
      const isHomeWrite = cf.root === 'home' || cf.root === 'vscode-user';
      const displayPath = isHomeWrite ? fullPath : cf.file;
      if (!fs.existsSync(fullPath)) continue;
      try {
        const live = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
        const op: ConfigMergeOp = {
          file: cf.file,
          root: cf.root as ConfigRoot | undefined,
          fragment: cf.fragment,
          strategy: cf.strategy as Record<string, MergeStrategy>,
        };
        const cleaned = reverseMerge(live, op);
        if (Object.keys(cleaned).length === 0) {
          fs.unlinkSync(fullPath);
          console.log(`  - ${displayPath}  (emptied, deleted)`);
        } else {
          fs.writeFileSync(fullPath, serialize(cleaned), 'utf-8');
          console.log(`  ~ ${displayPath}  (JSON reverse-merge applied)`);
        }
        configRemovedCount++;
      } catch (err) {
        console.warn(`  ⚠  Could not reverse-merge ${displayPath}: ${(err as Error).message}`);
      }
    }
  }

  saveManifest(opts.projectDir, manifest);

  const keptCount = opts.force ? 0 : driftedPaths.length;
  console.log(
    `\n✓ Uninstalled: ${ids.join(', ')}` +
      `  (${pathsToDelete.length - keptCount} file(s) removed` +
      (configRemovedCount > 0 ? `, ${configRemovedCount} JSON merge(s) reversed` : '') +
      (driftedPaths.length > 0 && !opts.force
        ? `, ${driftedPaths.length} drifted file(s) kept`
        : '') +
      ')',
  );
  console.log('');
}
