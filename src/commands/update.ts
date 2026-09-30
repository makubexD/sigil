/**
 * `sigil update [ids...]` command — refresh installed artifacts to the current catalog version.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * DRY fix: replaces 7 inline `require('fs'/'path')` calls with top-level node:fs / node:path
 * imports (the modules were already imported in cli.ts; the require() calls were a mistake).
 * The file-drift detection is extracted into `isFileDrifted` — a pure, testable helper.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveCatalog } from '../resolve';
import { loadAndValidate, writeFilesSync, detectProjectTarget } from '../cli-helpers';
import { getTarget } from '../targets';
import { loadManifest, saveManifest, sha256 } from '../manifest';

export interface UpdateOptions {
  projectDir: string;
  target?: string | undefined;
  catalogDir: string;
  packs: string;
  force: boolean;
  dryRun: boolean;
}

/**
 * Returns true when the file on disk has been modified since sigil recorded it.
 * A file that does not exist yet is NOT considered drifted — it simply needs writing.
 */
export function isFileDrifted(fullPath: string, recordedHash: string | undefined): boolean {
  if (!recordedHash) return false;
  if (!fs.existsSync(fullPath)) return false;
  const diskHash = sha256(fs.readFileSync(fullPath, 'utf-8'));
  return diskHash !== recordedHash;
}

export async function runUpdate(ids: string[], opts: UpdateOptions): Promise<void> {
  const { catalog: rawCatalog } = await loadAndValidate(opts.catalogDir, opts.packs);
  const resolved = resolveCatalog(rawCatalog);
  const targetName = opts.target ?? detectProjectTarget(opts.projectDir, { verbose: false });
  const target = getTarget(targetName);

  if (!target.scaffold) {
    console.error(`✗ Target '${targetName}' does not support the update command.`);
    process.exit(1);
  }

  let manifest;
  try {
    manifest = loadManifest(opts.projectDir);
  } catch (err) {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(1);
  }

  // Filter entries by target (and by explicit ids if provided)
  const idFilter = new Set(ids);
  const entries = manifest.entries.filter(
    e => e.target === targetName && (idFilter.size === 0 || idFilter.has(e.id)),
  );

  if (entries.length === 0) {
    const msg =
      idFilter.size > 0
        ? `No installed artifacts match: ${[...idFilter].join(', ')}`
        : `No artifacts installed for target '${targetName}'.`;
    console.log(`\n  ${msg}\n`);
    return;
  }

  const catalogIds = new Set(rawCatalog.artifacts.map(a => a.id));
  let updatedCount = 0;
  let skippedDrift = 0;
  let orphanedCount = 0;

  console.log('');
  for (const entry of entries) {
    if (!catalogIds.has(entry.id)) {
      console.log(`  ✗  ${entry.id}  (orphaned — no longer in catalog, run sigil uninstall)`);
      orphanedCount++;
      continue;
    }

    // Re-scaffold to get fresh file content
    let freshFiles: Record<string, string>;
    try {
      freshFiles = await target.scaffold!(entry.id, resolved, {
        projectDir: opts.projectDir,
        overwrite: true,
        includeDeps: false,
      });
    } catch (err) {
      console.error(`  ✗  ${entry.id}: scaffold failed — ${(err as Error).message}`);
      continue;
    }

    const recordedByPath = new Map(entry.files.map(f => [f.path, f.sha256]));
    const toWrite: Record<string, string> = {};
    const skipped: string[] = [];

    for (const [relPath, content] of Object.entries(freshFiles)) {
      const freshHash = sha256(content);
      const recordedHash = recordedByPath.get(relPath);

      if (recordedHash && freshHash === recordedHash) {
        // File content matches what was installed — no change needed.
        continue;
      }

      // Check whether the user has drifted the file since install.
      const fullPath = path.join(opts.projectDir, relPath);
      if (isFileDrifted(fullPath, recordedHash)) {
        if (!opts.force) {
          skipped.push(relPath);
          skippedDrift++;
          continue;
        }
      }

      toWrite[relPath] = content;
    }

    if (opts.dryRun) {
      if (Object.keys(toWrite).length === 0 && skipped.length === 0) {
        console.log(`  =  ${entry.id}  (up-to-date)`);
      } else {
        console.log(`  ↑  ${entry.id}`);
        for (const p of Object.keys(toWrite)) console.log(`     ~ ${p}`);
        for (const p of skipped) console.log(`     ⊘ ${p}  (drifted — would skip without --force)`);
      }
      continue;
    }

    if (Object.keys(toWrite).length > 0) {
      writeFilesSync(toWrite, opts.projectDir);
      console.log(`  ✓  ${entry.id}  (${Object.keys(toWrite).length} file(s) updated)`);
      for (const p of skipped) console.log(`     ⊘ ${p}  (drifted — skipped)`);
      updatedCount++;

      // Refresh manifest hashes to reflect the newly written content.
      for (const mf of entry.files) {
        const fullPath = path.join(opts.projectDir, mf.path);
        if (fs.existsSync(fullPath)) {
          mf.sha256 = sha256(fs.readFileSync(fullPath, 'utf-8'));
        }
      }
    } else {
      if (skipped.length > 0) {
        console.log(`  ~  ${entry.id}  (drifted — run with --force to overwrite)`);
        for (const p of skipped) console.log(`     ~ ${p}`);
      } else {
        console.log(`  =  ${entry.id}  (already up-to-date)`);
      }
    }
  }

  if (!opts.dryRun) {
    saveManifest(opts.projectDir, manifest);
    console.log(
      `\n✓ ${updatedCount} artifact(s) updated` +
        (skippedDrift > 0 ? `, ${skippedDrift} file(s) skipped (drifted)` : '') +
        (orphanedCount > 0 ? `, ${orphanedCount} orphaned (run sigil uninstall)` : '') +
        '.',
    );
  } else {
    console.log('\nDry run complete. No files were written.');
  }
  console.log('');
}
