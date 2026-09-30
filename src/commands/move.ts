/**
 * `sigil move <id> <new-id>` command — rename/relocate a catalog artifact.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 * Replaces 3 inline `require('fs'/'gray-matter'/'fast-glob')` calls with top-level imports.
 *
 * @module
 */
import path from 'node:path';
import fs from 'node:fs';
import matter from 'gray-matter';
import fg from 'fast-glob';
import { confirm, isCancel, cancel } from '@clack/prompts';
import { getAllTargets } from '../targets';
import { isInteractiveTTY } from '../wizard';
import { planMove, executeMove, summarizePlan } from '../authoring/move';
import type { LoadedCatalog } from '../types';
import { SigilError } from '../errors';
import { requireValidCatalog } from '../cli-helpers';

export interface MoveOptions {
  catalogDir: string;
  dryRun: boolean;
  yes: boolean;
}

/**
 * Synchronous mini-loader used by executeMove's post-move validation callback.
 * Reads all .md files in a directory and constructs a minimal LoadedCatalog so
 * checkSourceArtifact can run without a full async loadCatalog call.
 */
function loadCatalogSync(dir: string): LoadedCatalog {
  const absDir = path.resolve(dir);
  const mdFiles = fg.sync('**/*.md', { cwd: absDir, absolute: true });
  const artifacts: LoadedCatalog['artifacts'] = [];
  const byId = new Map<string, LoadedCatalog['artifacts'][number]>();

  for (const f of mdFiles) {
    try {
      const raw = fs.readFileSync(f, 'utf-8');
      const parsed = matter(raw);
      const { id: fmId, kind } = parsed.data as { id?: string; kind?: string };
      if (!fmId || !kind) continue;
      const a = {
        id: fmId,
        kind: kind as never,
        filePath: f,
        frontmatter: parsed.data,
        body: parsed.content,
      };
      artifacts.push(a);
      byId.set(fmId, a);
    } catch {
      // Skip unparseable files during post-move validation
    }
  }

  return { artifacts, byId, languages: new Map() };
}

export async function runMove(oldId: string, newId: string, opts: MoveOptions): Promise<void> {
  const catalog = await requireValidCatalog(opts.catalogDir);

  let plan;
  try {
    plan = planMove(oldId, newId, catalog, opts.catalogDir);
  } catch (err) {
    throw new SigilError((err as Error).message, { cause: err });
  }

  const summary = summarizePlan(plan);

  if (opts.dryRun) {
    console.log('\nDry run — move plan:');
    for (const m of summary.moves) {
      console.log(`  rename: ${m.from}`);
      console.log(`       → ${m.to}`);
    }
    if (summary.referrerRewrites.length > 0) {
      console.log('\n  Referrers to rewrite:');
      for (const r of summary.referrerRewrites) {
        console.log(`  ~ ${r.file}  (${r.fields.join(', ')})`);
      }
    }
    console.log('\nNo files were changed (--dry-run).');
    return;
  }

  // Confirm
  const isTTY = isInteractiveTTY();
  if (!opts.yes && !isTTY) {
    throw new SigilError('stdin/stdout is not interactive. Re-run with --yes to confirm.');
  }
  if (!opts.yes) {
    const ok = await confirm({
      message:
        `Move '${oldId}' → '${newId}'?` +
        (plan.referrers.length > 0
          ? ` (${plan.referrers.length} referrer(s) will be rewritten)`
          : ''),
      initialValue: false,
    });
    if (isCancel(ok) || !ok) {
      cancel('Move cancelled.');
      return;
    }
  }

  const result = executeMove(plan, catalog, getAllTargets(), loadCatalogSync, opts.catalogDir);

  if (!result.ok) {
    throw new SigilError('Move failed (rolled back):', {
      hint: result.errors.map(e => `  ${e}`).join('\n'),
    });
  }

  console.log(`\n✓ Moved '${oldId}' → '${newId}'`);
  for (const f of result.changed) console.log(`  ✓ ${f}`);
  console.log('\n  Next: npm run validate  (to confirm catalog integrity)');
}
