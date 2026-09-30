/**
 * Dry-run preview of a move plan — pure, no I/O.
 */
import path from 'path';
import type { MovePlan } from './plan';
import { SKILL_FILENAME } from '../../paths';

export interface MovePlanSummary {
  /** The file or directory to be renamed. */
  moves: Array<{ from: string; to: string }>;
  /** Artifact source files that will have references rewritten. */
  referrerRewrites: Array<{ file: string; fields: string[] }>;
}

export function summarizePlan(plan: MovePlan): MovePlanSummary {
  const isSkill = plan.artifact.kind === 'skill';
  const moves = [{ from: plan.sourcePath, to: plan.destinationPath }];
  const referrerRewrites = plan.referrers.map(r => ({
    file: r.filePath,
    fields: r.fields as string[],
  }));

  // Also note the frontmatter update in the moved file itself
  const movedFilePath = isSkill
    ? path.join(plan.destinationPath, SKILL_FILENAME)
    : plan.destinationPath;
  referrerRewrites.unshift({ file: movedFilePath, fields: ['id'] });

  return { moves, referrerRewrites };
}
