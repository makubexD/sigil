/**
 * Where `sigil import` puts an imported skill's stack files (`references/stack-<stack>.md`) when the
 * catalog has a `standard.yaml`: `shared/` holds only language-neutral text, so a shared skill's
 * stack file becomes a stack part in the language that owns the stack,
 * `languages/<home>/stack-parts/<skill>.md` (load-references.ts reads it back). A stack the standard
 * does not declare, or one without a home, is not imported; a language skill carries no stack files.
 * Without a standard (a custom catalog), nothing is routed: the files stay in the skill.
 *
 * @module
 */
import path from 'node:path';
import type { ReferenceFile } from '../../types';
import type { CatalogStandard } from '../../catalog-standard';
import { STANDARD_FILE } from '../../catalog-standard';
import { LANGUAGES_DIR, SHARED_NAMESPACE } from '../../catalog-layout';
import { STACK_PARTS_DIR } from '../../load-references';
import { resolveContained } from '../../contained-path';

const STACK_FILE_RE = /^stack-(.+)\.md$/;

/** A stack file written as a part, at `destPath`. */
export interface RoutedStackPart {
  readonly name: string;
  readonly destPath: string;
  readonly content: string;
}

/** A skill's references split into the ones it keeps, its stack parts, and the ones left out. */
export interface StackRouting {
  readonly references: ReferenceFile[];
  readonly parts: RoutedStackPart[];
  readonly skipped: Array<{ readonly name: string; readonly reason: string }>;
}

/** Where to put one stack file of skill `skillName` in `namespace`, or why it stays out. */
function placeStackFile(
  stack: string,
  namespace: string,
  standard: CatalogStandard,
): { home: string } | { reason: string } {
  if (namespace !== SHARED_NAMESPACE) {
    return { reason: 'a language skill carries no stack files; import it with --shared' };
  }
  const declared = standard.stacks.find(s => s.id === stack);
  if (!declared) return { reason: `stack '${stack}' is not declared in ${STANDARD_FILE}` };
  if (!declared.home) return { reason: `stack '${stack}' declares no home in ${STANDARD_FILE}` };
  return { home: declared.home };
}

/** `ref` as a part of `target`'s skill in language `home`, at a path contained in languages/. */
function partAt(
  ref: ReferenceFile,
  home: string,
  target: { skillName: string; catalogDir: string },
): RoutedStackPart {
  const languagesDir = path.join(target.catalogDir, LANGUAGES_DIR);
  const rel = path.join(home, STACK_PARTS_DIR, `${target.skillName}.md`);
  return { name: ref.name, destPath: resolveContained(languagesDir, rel), content: ref.content };
}

/** Splits `references` of skill `skillName`, imported into `namespace`, by the catalog standard. */
export function routeStackFiles(
  references: readonly ReferenceFile[],
  target: { namespace: string; skillName: string; catalogDir: string },
  standard: CatalogStandard | undefined,
): StackRouting {
  const routing: StackRouting = { references: [], parts: [], skipped: [] };
  for (const ref of references) {
    const stack = STACK_FILE_RE.exec(ref.name)?.[1];
    const place = stack && standard ? placeStackFile(stack, target.namespace, standard) : undefined;
    if (!place) routing.references.push(ref);
    else if ('reason' in place) routing.skipped.push({ name: ref.name, reason: place.reason });
    else routing.parts.push(partAt(ref, place.home, target));
  }
  return routing;
}
