/**
 * Move execution: atomic rename with LIFO rollback on failure.
 *
 * Steps:
 *   1. Move the file(s) to the new path.
 *   2. Update the id field in the moved artifact's frontmatter.
 *   3. Rewrite all referrer files.
 *   4. Re-load and validate. Roll back everything on any violation.
 */
import fs from 'fs';
import path from 'path';
import type { LoadedCatalog, Target } from '../../types';
import { writeArtifactFrontmatter } from '../frontmatter';
import { checkSourceArtifact } from '../check-source';
import { SKILL_FILENAME } from '../../paths';
import type { MovePlan } from './plan';

export interface MoveResult {
  ok: boolean;
  errors: string[];
  /** Files that were moved/updated. */
  changed: string[];
}

/** Parameters for {@link executeMove}. */
export interface ExecuteMoveOptions {
  /** The plan from planMove. */
  plan: MovePlan;
  /** Loaded catalog (for referrer rewrites + post-move check). */
  catalog: LoadedCatalog;
  /** Registered targets (for post-move checkSourceArtifact). */
  targets: Target[];
  /** Injected loadCatalog to decouple from I/O. */
  loadFn: (dir: string) => LoadedCatalog;
  /** Catalog root (for post-move re-load). */
  catalogDir: string;
}

/** Step 1: moves the artifact's file(s) to the destination path, recording a rollback step. */
function moveFiles(plan: MovePlan, rollbackSteps: Array<() => void>, changed: string[]): void {
  fs.mkdirSync(path.dirname(plan.destinationPath), { recursive: true });
  renameOrCopy(plan.sourcePath, plan.destinationPath, rollbackSteps);
  changed.push(plan.destinationPath);
}

/** Step 2: rewrites the `id:` field in the moved artifact's frontmatter, recording a rollback step. */
function updateMovedId(plan: MovePlan, rollbackSteps: Array<() => void>): void {
  const movedFilePath =
    plan.artifact.kind === 'skill'
      ? path.join(plan.destinationPath, SKILL_FILENAME)
      : plan.destinationPath;

  const movedOriginal = fs.readFileSync(movedFilePath, 'utf-8');
  rollbackSteps.push(() => {
    try {
      fs.writeFileSync(movedFilePath, movedOriginal, 'utf-8');
    } catch {
      // Best-effort rollback — ignore secondary errors
    }
  });

  writeArtifactFrontmatter(movedFilePath, { id: plan.newId });
}

/** Replaces the first occurrence of `oldId` with `newId` in an id array, in place. */
function replaceIdInPlace(arr: string[], oldId: string, newId: string): string[] {
  const idx = arr.indexOf(oldId);
  if (idx !== -1) arr[idx] = newId;
  return arr;
}

/** Builds the `extends:` patch fragment for one referrer, if that field is affected. */
function buildExtendsPatch(
  referrer: MovePlan['referrers'][number],
  fm: Record<string, unknown>,
  oldId: string,
  newId: string,
): string[] | undefined {
  if (!referrer.fields.includes('extends')) return undefined;
  return replaceIdInPlace([...((fm.extends as string[] | undefined) ?? [])], oldId, newId);
}

/** Builds the `uses:` patch fragment for one referrer, if either uses field is affected. */
function buildUsesPatch(
  referrer: MovePlan['referrers'][number],
  fm: Record<string, unknown>,
  oldId: string,
  newId: string,
): { rules: string[]; agents: string[] } | undefined {
  const hasUsesChange =
    referrer.fields.includes('uses.rules') || referrer.fields.includes('uses.agents');
  if (!hasUsesChange) return undefined;

  const uses = (fm.uses as { rules?: string[]; agents?: string[] } | undefined) ?? {};
  const rules = [...(uses.rules ?? [])];
  const agents = [...(uses.agents ?? [])];
  if (referrer.fields.includes('uses.rules')) replaceIdInPlace(rules, oldId, newId);
  if (referrer.fields.includes('uses.agents')) replaceIdInPlace(agents, oldId, newId);
  return { rules, agents };
}

/** Builds the frontmatter patch for one referrer, rewriting oldId → newId in its declared fields. */
function buildReferrerPatch(
  referrer: MovePlan['referrers'][number],
  fm: Record<string, unknown>,
  oldId: string,
  newId: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const extendsPatch = buildExtendsPatch(referrer, fm, oldId, newId);
  if (extendsPatch) patch.extends = extendsPatch;
  const usesPatch = buildUsesPatch(referrer, fm, oldId, newId);
  if (usesPatch) patch.uses = usesPatch;
  return patch;
}

/** Records the rollback step that restores one referrer file to its pre-edit content. */
function recordReferrerRollback(filePath: string, rollbackSteps: Array<() => void>): string {
  const origContent = fs.readFileSync(filePath, 'utf-8');
  rollbackSteps.push(() => {
    try {
      fs.writeFileSync(filePath, origContent, 'utf-8');
    } catch {
      // Best-effort rollback — ignore secondary errors
    }
  });
  return origContent;
}

/** Rewrites one referrer file's frontmatter, recording a rollback step for it first. */
function rewriteOneReferrer(
  referrer: MovePlan['referrers'][number],
  plan: MovePlan,
  catalog: LoadedCatalog,
  rollbackSteps: Array<() => void>,
): void {
  recordReferrerRollback(referrer.filePath, rollbackSteps);

  const refArtifact = catalog.byId.get(referrer.artifactId);
  if (!refArtifact) {
    throw new Error(
      `[move] Referrer '${referrer.artifactId}' (from ${referrer.filePath}) is not in the loaded catalog`,
    );
  }

  const patch = buildReferrerPatch(referrer, refArtifact.frontmatter, plan.oldId, plan.newId);
  writeArtifactFrontmatter(referrer.filePath, patch);
}

/** Step 3: rewrites every referrer's `extends`/`uses` fields, recording a rollback step per file. */
function rewriteReferrers(
  plan: MovePlan,
  catalog: LoadedCatalog,
  rollbackSteps: Array<() => void>,
  changed: string[],
): void {
  for (const referrer of plan.referrers) {
    rewriteOneReferrer(referrer, plan, catalog, rollbackSteps);
    changed.push(referrer.filePath);
  }
}

/** Step 4: re-validates the moved artifact; returns violation messages, or [] when clean. */
function postMoveValidate(
  plan: MovePlan,
  targets: Target[],
  loadFn: ExecuteMoveOptions['loadFn'],
  catalogDir: string,
): string[] {
  const updatedCatalog = loadFn(catalogDir);
  const updatedArtifact = updatedCatalog.byId.get(plan.newId);
  if (!updatedArtifact) return [];
  return checkSourceArtifact(updatedArtifact, updatedCatalog, targets).map(v => v.problem);
}

/**
 * Execute a move plan with best-effort LIFO rollback on failure.
 *
 * The caller must reload the catalog and run `validate` after a successful move.
 */
export function executeMove(options: ExecuteMoveOptions): MoveResult {
  const { plan, catalog, targets, loadFn, catalogDir } = options;
  const changed: string[] = [];
  const rollbackSteps: Array<() => void> = [];

  try {
    moveFiles(plan, rollbackSteps, changed);
    updateMovedId(plan, rollbackSteps);
    rewriteReferrers(plan, catalog, rollbackSteps, changed);

    const violations = postMoveValidate(plan, targets, loadFn, catalogDir);
    if (violations.length > 0) {
      rollbackAll(rollbackSteps);
      return { ok: false, errors: violations, changed: [] };
    }

    return { ok: true, errors: [], changed };
  } catch (err) {
    rollbackAll(rollbackSteps);
    return { ok: false, errors: [(err as Error).message], changed: [] };
  }
}

// ─── Private I/O helpers ──────────────────────────────────────────────────────

/**
 * `EXDEV` ("cross-device link") is the one rename failure the copy+delete fallback exists for —
 * renaming across filesystems/mount points is unsupported by the OS, not an error. Any other
 * code (`EACCES`, `ENOENT`, a Windows file lock) is a real failure and must propagate, not be
 * silently reinterpreted as "fall back to copy". Found by the round-4 (2026-08-23) audit's
 * dogfooded `ts-code-reviewer` run: the previous bare `catch {}` masked every rename failure
 * behind the fallback, the same "catch the narrowest type possible" violation F22-27 already
 * fixed elsewhere in this codebase (see CLAUDE.md's invariant list).
 */
function pushRenameBackRollback(src: string, dest: string, rollbackSteps: Array<() => void>): void {
  rollbackSteps.push(() => {
    try {
      fs.renameSync(dest, src);
    } catch {
      // Best-effort rollback — ignore secondary errors
    }
  });
}

/** Registered BEFORE copying so a mid-copy throw still gets its partial destination cleaned up. */
function pushRemoveDestRollback(dest: string, rollbackSteps: Array<() => void>): void {
  rollbackSteps.push(() => {
    try {
      removeRecursive(dest);
      // Note: can't restore the source — best effort only
    } catch {
      // Best-effort rollback — ignore secondary errors
    }
  });
}

/**
 * `EXDEV` ("cross-device link") is the one rename failure the copy+delete fallback exists for.
 * Any other code (`EACCES`, `ENOENT`, a Windows file lock) is a real failure and must propagate,
 * not be silently reinterpreted as "fall back to copy" — found by the round-4 (2026-08-23)
 * audit's dogfooded `ts-code-reviewer` run (the previous bare `catch {}` masked every rename
 * failure), the same "catch the narrowest type possible" class F22-27 already fixed elsewhere.
 */
function renameOrCopy(src: string, dest: string, rollbackSteps: Array<() => void>): void {
  try {
    fs.renameSync(src, dest);
    pushRenameBackRollback(src, dest, rollbackSteps);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    // Cross-device rename — fall back to copy+delete.
    pushRemoveDestRollback(dest, rollbackSteps);
    copyRecursive(src, dest);
    removeRecursive(src);
  }
}

function copyRecursive(src: string, dest: string): void {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function removeRecursive(p: string): void {
  fs.rmSync(p, { recursive: true, force: true });
}

function rollbackAll(steps: Array<() => void>): void {
  // Apply rollback steps in reverse order (LIFO)
  for (let i = steps.length - 1; i >= 0; i--) {
    try {
      // i is in-bounds (i >= 0 && i < steps.length) — non-null guaranteed
      steps[i]!();
    } catch {
      // Best-effort; don't let a failed rollback hide the original error
    }
  }
}
