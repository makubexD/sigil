/**
 * `sigil move <id> <new-id>` command — rename/relocate a catalog artifact.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 * Replaces 3 inline `require('fs'/'gray-matter'/'tinyglobby')` calls with top-level imports.
 *
 * @module
 */
import path from 'node:path';
import fs from 'node:fs';
import { parseFrontmatter } from '../frontmatter-parse';
import { globSync } from 'tinyglobby';
import { confirm, isCancel } from '../wizard/prompts';
import { cancel } from '../wizard/frame';
import { getAllTargets } from '../targets';
import { isInteractiveTTY } from '../wizard';
import { planMove, executeMove, summarizePlan } from '../authoring/move';
import type { LoadedCatalog } from '../types';
import { ALL_KINDS, sourceGlob } from '../kinds';
import { loadLanguages } from '../load';
import { SigilError } from '../errors';
import { requireValidCatalog } from '../cli-helpers';

export interface MoveOptions {
  catalogDir: string;
  dryRun: boolean;
  yes: boolean;
}

/** Parses one .md file into a minimal Artifact, or undefined when unparseable/missing id+kind. */
function parseArtifactSync(filePath: string): LoadedCatalog['artifacts'][number] | undefined {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseFrontmatter(raw);
    const { id: fmId, kind } = parsed.data as { id?: string; kind?: string };
    if (!fmId || !kind) return undefined;
    return {
      id: fmId,
      kind: kind as never,
      filePath,
      frontmatter: parsed.data,
      body: parsed.content,
    };
  } catch {
    // Skip unparseable files during post-move validation
    return undefined;
  }
}

/**
 * Synchronous mini-loader used by executeMove's post-move validation callback.
 * Reads all .md files in a directory and constructs a minimal LoadedCatalog so
 * checkSourceArtifact can run without a full async loadCatalog call.
 */
function loadCatalogSync(dir: string): LoadedCatalog {
  const absDir = path.resolve(dir);
  const sourceFiles = globSync(ALL_KINDS.map(sourceGlob), {
    cwd: absDir,
    absolute: true,
    expandDirectories: false,
  });
  const artifacts = sourceFiles
    .map(parseArtifactSync)
    .filter((a): a is LoadedCatalog['artifacts'][number] => a !== undefined);
  const byId = new Map(artifacts.map(a => [a.id, a]));

  return { artifacts, byId, languages: loadLanguages(absDir), skipWarnings: [], root: absDir };
}

/** Prints the dry-run move plan (renames + referrer rewrites), no files touched. */
function printDryRunPlan(summary: ReturnType<typeof summarizePlan>): void {
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
}

/** Builds the "Move 'x' → 'y'? (N referrer(s) will be rewritten)" confirm message. */
function buildMoveConfirmMessage(oldId: string, newId: string, referrerCount: number): string {
  const suffix = referrerCount > 0 ? ` (${referrerCount} referrer(s) will be rewritten)` : '';
  return `Move '${oldId}' → '${newId}'?${suffix}`;
}

/** Confirms the move with the user unless --yes was passed; throws/cancels as appropriate. */
async function confirmMove(
  oldId: string,
  newId: string,
  referrerCount: number,
  opts: MoveOptions,
): Promise<boolean> {
  if (opts.yes) return true;
  if (!isInteractiveTTY()) {
    throw new SigilError('stdin/stdout is not interactive. Re-run with --yes to confirm.');
  }
  const ok = await confirm({
    message: buildMoveConfirmMessage(oldId, newId, referrerCount),
    initialValue: false,
  });
  if (isCancel(ok) || !ok) {
    cancel('Move cancelled.');
    return false;
  }
  return true;
}

/** Prints the post-move success summary. */
function printMoveSuccess(oldId: string, newId: string, changed: string[]): void {
  console.log(`\n✓ Moved '${oldId}' → '${newId}'`);
  for (const f of changed) console.log(`  ✓ ${f}`);
  console.log('\n  Next: npm run validate  (to confirm catalog integrity)');
}

/** Throws with the rollback error hint when executeMove reports failure. */
function assertMoveOk(result: ReturnType<typeof executeMove>): void {
  if (result.ok) return;
  throw new SigilError('Move failed (rolled back):', {
    hint: result.errors.map(e => `  ${e}`).join('\n'),
  });
}

/** Runs executeMove and reports the outcome; throws on rollback. */
function applyMove(
  plan: ReturnType<typeof planMove>,
  catalog: LoadedCatalog,
  opts: MoveOptions,
): void {
  const result = executeMove({
    plan,
    catalog,
    targets: getAllTargets(),
    loadFn: loadCatalogSync,
    catalogDir: opts.catalogDir,
  });
  assertMoveOk(result);
  printMoveSuccess(plan.oldId, plan.newId, result.changed);
}

export async function runMove(oldId: string, newId: string, opts: MoveOptions): Promise<void> {
  const catalog = await requireValidCatalog(opts.catalogDir);

  let plan;
  try {
    plan = planMove(oldId, newId, catalog, opts.catalogDir);
  } catch (err) {
    throw new SigilError((err as Error).message, { cause: err });
  }

  if (opts.dryRun) {
    printDryRunPlan(summarizePlan(plan));
    return;
  }

  if (!(await confirmMove(oldId, newId, plan.referrers.length, opts))) return;
  applyMove(plan, catalog, opts);
}
