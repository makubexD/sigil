/**
 * §11: (warning) a skill's SKILL.md and references/*.md point only at bundled files that ship
 * with it. A backticked `references/<file>` must be one of the skill's loaded reference files, and
 * `assets/…`/`scripts/…` are flagged outright: the loader reads only flat `references/*.md`, so no
 * target emits them and the link would be dead in every install.
 *
 * Found by the 2026-09-27 install audit of the migrated `shared/cli`/`shared/wizard` skills, whose
 * source had nested `references/stacks/` and `assets/` folders. A bare directory name (`stacks/`)
 * is deliberately not checked: it can't be told apart from a project path such as `src/`. This is
 * the minimal slice of the ADR's Phase 1c "links resolve inside the skill root" lint.
 */
import type { Artifact } from '../types';
import type { ValidateCtx } from './types';

const BACKTICKED_RE = /`([^`\s]+)`/g;
const REFERENCE_RE = /^references\/(.+)$/;
const UNSHIPPED_RE = /^(assets|scripts)\//;
/** Placeholders (`stack-<lang>.md`), globs, and elisions (`references/…`) aren't concrete paths. */
const NOT_A_PATH_RE = /[*<>{}$…]/;

/** Returns the problem with one backticked token, or undefined when it's fine. */
function pathProblem(token: string, shipped: ReadonlySet<string>): string | undefined {
  if (NOT_A_PATH_RE.test(token)) return undefined;
  if (UNSHIPPED_RE.test(token)) return 'assets/ and scripts/ are not shipped with skills';
  const ref = REFERENCE_RE.exec(token);
  if (ref && !shipped.has(ref[1]!)) return 'no such file in references/';
  return undefined;
}

export function checkSkillPaths(ctx: ValidateCtx, artifact: Artifact): void {
  if (artifact.kind !== 'skill') return;
  const references = artifact.references ?? [];
  const shipped = new Set(references.map(r => r.name));
  const documents: [string, string][] = [
    ['SKILL.md', artifact.body],
    ...references.map((r): [string, string] => [`references/${r.name}`, r.content]),
  ];
  for (const [file, text] of documents) {
    for (const [, token] of text.matchAll(BACKTICKED_RE)) {
      const problem = pathProblem(token!, shipped);
      if (problem) ctx.warnings.push(`[${artifact.id}] ${file} points to \`${token}\`: ${problem}`);
    }
  }
}
