/**
 * §12: an `mcp` artifact's `{sigil:var:NAME}` tokens and its `vars:` declarations must agree.
 * A token with no declaration has no prompt and no value at install, and a declaration with no
 * token is dead frontmatter. Both are errors rather than warnings: unlike `deprecated:`, there is
 * nothing a target could still emit from either side.
 */
import type { Artifact } from '../types';
import type { ValidateCtx } from './types';
import { declaredVarNames, varTokenNames } from '../mcp-vars';

/** §12: errors once per undeclared token and once per unused declaration. */
export function checkVarDeclarations(ctx: ValidateCtx, artifact: Artifact): void {
  if (artifact.kind !== 'mcp') return;

  const used = varTokenNames(artifact.frontmatter['server']);
  const declared = declaredVarNames(artifact);

  for (const name of used.filter(n => !declared.includes(n))) {
    ctx.errors.push({
      artifactId: artifact.id,
      filePath: artifact.filePath,
      error: `[${artifact.id}] server writes {sigil:var:${name}} but vars: does not declare '${name}'.`,
    });
  }

  for (const name of declared.filter(n => !used.includes(n))) {
    ctx.errors.push({
      artifactId: artifact.id,
      filePath: artifact.filePath,
      error: `[${artifact.id}] vars: declares '${name}' but server never writes {sigil:var:${name}}.`,
    });
  }
}
