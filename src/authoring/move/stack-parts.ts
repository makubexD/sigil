/**
 * Keeps what names a moved artifact in step with `sigil move`, besides its referrers:
 *   - `catalog/standard.yaml`, which lists family members by id (standard-member.ts);
 *   - a shared skill's stack parts, named after the skill (`languages/<lang>/stack-parts/<skill>.md`,
 *     load-references.ts). Renaming the skill renames every part; otherwise the parts would name
 *     no skill and the skill would lose its stack files. A skill with parts cannot leave `shared/`:
 *     only a shared skill carries them.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ArtifactKind, LanguageMetadata } from '../../types';
import { stackPartsBySkill, type StackPart } from '../../load-references';
import { SHARED_NAMESPACE } from '../../catalog-layout';
import { moveStandardMember } from './standard-member';

/** What the move renames, and where the catalog is. */
export interface MovedNames {
  readonly catalogDir: string;
  readonly languages: ReadonlyMap<string, LanguageMetadata>;
  readonly plan: {
    readonly oldId: string;
    readonly newId: string;
    readonly artifact: { kind: ArtifactKind };
  };
}

const isShared = (id: string) => id.startsWith(`${SHARED_NAMESPACE}/`);
const nameOf = (id: string) => id.split('/').pop() ?? id;

/** The stack parts `moved` must rename: none unless a shared skill changes its name. */
function partsToRename(moved: MovedNames): StackPart[] {
  const { oldId, newId, artifact } = moved.plan;
  if (artifact.kind !== 'skill' || !isShared(oldId) || nameOf(oldId) === nameOf(newId)) return [];
  const parts = stackPartsBySkill(moved.catalogDir, moved.languages).parts.get(nameOf(oldId)) ?? [];
  if (parts.length > 0 && !isShared(newId)) {
    throw new Error(
      `${oldId} has stack parts (languages/*/stack-parts/); only a shared skill carries them`,
    );
  }
  return parts;
}

/**
 * Renames `moved`'s family membership and stack parts, recording a rollback step for each file
 * and adding it to `changed`.
 */
export function moveNamedRecords(
  moved: MovedNames,
  rollbackSteps: Array<() => void>,
  changed: string[],
): void {
  moveStandardMember(moved.catalogDir, moved.plan, rollbackSteps, changed);
  for (const part of partsToRename(moved)) {
    const target = path.join(path.dirname(part.file), `${nameOf(moved.plan.newId)}.md`);
    fs.renameSync(part.file, target);
    rollbackSteps.push(() => fs.renameSync(target, part.file));
    changed.push(target);
  }
}
