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
import type { MovePlan } from './plan';

export interface MoveResult {
  ok: boolean;
  errors: string[];
  /** Files that were moved/updated. */
  changed: string[];
}

/**
 * Execute a move plan with best-effort LIFO rollback on failure.
 *
 * The caller must reload the catalog and run `validate` after a successful move.
 *
 * @param plan       The plan from planMove.
 * @param catalog    Loaded catalog (for referrer rewrites + post-move check).
 * @param targets    Registered targets (for post-move checkSourceArtifact).
 * @param loadFn     Injected loadCatalog to decouple from I/O.
 * @param catalogDir Catalog root (for post-move re-load).
 */
export function executeMove(
  plan: MovePlan,
  catalog: LoadedCatalog,
  targets: Target[],
  loadFn: (dir: string) => LoadedCatalog,
  catalogDir: string,
): MoveResult {
  const changed: string[] = [];
  const rollbackSteps: Array<() => void> = [];

  try {
    // ── Step 1: Move file(s) ────────────────────────────────────────────────
    const destParent = path.dirname(plan.destinationPath);
    fs.mkdirSync(destParent, { recursive: true });

    renameOrCopy(plan.sourcePath, plan.destinationPath, rollbackSteps);
    changed.push(plan.destinationPath);

    // ── Step 2: Update id in the moved artifact ─────────────────────────────
    const movedFilePath =
      plan.artifact.kind === 'skill'
        ? path.join(plan.destinationPath, 'SKILL.md')
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

    // ── Step 3: Rewrite referrers ────────────────────────────────────────────
    for (const referrer of plan.referrers) {
      const origContent = fs.readFileSync(referrer.filePath, 'utf-8');
      rollbackSteps.push(() => {
        try {
          fs.writeFileSync(referrer.filePath, origContent, 'utf-8');
        } catch {
          // Best-effort rollback — ignore secondary errors
        }
      });

      const refArtifact = catalog.byId.get(referrer.artifactId)!;
      const fm = refArtifact.frontmatter;
      const patch: Record<string, unknown> = {};

      if (referrer.fields.includes('extends')) {
        const arr = [...((fm.extends as string[] | undefined) ?? [])];
        const idx = arr.indexOf(plan.oldId);
        if (idx !== -1) arr[idx] = plan.newId;
        patch.extends = arr;
      }

      const hasUsesChange =
        referrer.fields.includes('uses.rules') || referrer.fields.includes('uses.agents');
      if (hasUsesChange) {
        const uses = (fm.uses as { rules?: string[]; agents?: string[] } | undefined) ?? {};
        const rules = [...(uses.rules ?? [])];
        const agents = [...(uses.agents ?? [])];

        if (referrer.fields.includes('uses.rules')) {
          const idx = rules.indexOf(plan.oldId);
          if (idx !== -1) rules[idx] = plan.newId;
        }
        if (referrer.fields.includes('uses.agents')) {
          const idx = agents.indexOf(plan.oldId);
          if (idx !== -1) agents[idx] = plan.newId;
        }
        patch.uses = { rules, agents };
      }

      writeArtifactFrontmatter(referrer.filePath, patch);
      changed.push(referrer.filePath);
    }

    // ── Step 4: Post-move validation ─────────────────────────────────────────
    const updatedCatalog = loadFn(catalogDir);
    const updatedArtifact = updatedCatalog.byId.get(plan.newId);
    if (updatedArtifact) {
      const violations = checkSourceArtifact(updatedArtifact, updatedCatalog, targets);
      if (violations.length > 0) {
        rollbackAll(rollbackSteps);
        return { ok: false, errors: violations.map(v => v.problem), changed: [] };
      }
    }

    return { ok: true, errors: [], changed };
  } catch (err) {
    rollbackAll(rollbackSteps);
    return { ok: false, errors: [(err as Error).message], changed: [] };
  }
}

// ─── Private I/O helpers ──────────────────────────────────────────────────────

function renameOrCopy(src: string, dest: string, rollbackSteps: Array<() => void>): void {
  try {
    fs.renameSync(src, dest);
    rollbackSteps.push(() => {
      try {
        fs.renameSync(dest, src);
      } catch {
        // Best-effort rollback — ignore secondary errors
      }
    });
  } catch {
    // Cross-device rename fails on some systems — fall back to copy+delete
    copyRecursive(src, dest);
    rollbackSteps.push(() => {
      try {
        removeRecursive(dest);
        // Note: can't restore the source — best effort only
      } catch {
        // Best-effort rollback — ignore secondary errors
      }
    });
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
