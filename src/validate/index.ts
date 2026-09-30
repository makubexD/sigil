/**
 * Validate phase: schema-checks every artifact and verifies reference-graph integrity.
 * Run this before Resolve so Resolve can assume a clean catalog.
 *
 * Checks (split by concern across sibling modules — see each file's own header comment):
 *   1. Frontmatter conforms to the zod schema for its kind.            — schema-checks.ts
 *   2. Every id in `extends` and `uses.rules`/`uses.agents` exists.     — schema-checks.ts
 *   3. No cycles in the `extends` graph.                                — cycles.ts
 *   4. (warning) No-op `appliesTo: ["**\/*"]` without a rationale.      — scope-checks.ts
 *   5. (warning) `platforms:` values are known/kind-supporting.         — platform-checks.ts
 *   6. (warning) Two same-language rules extending the same ancestor    — scope-checks.ts
 *      into the same appliesTo scope (double-loads the ancestor body).
 *   7. (warning) A skill body hardcodes a test-runner import outside    — runner-check.ts
 *      of an "Example shown with X" framing.
 *   8. (warning) A second target declares support for a kind whose      — platform-checks.ts
 *      KIND_REGISTRY.ownedBy names a different, single owner.
 *   9. `template:` references resolve, slots satisfy the template,      — template-checks.ts
 *      no artifact re-duplicates prose the template already owns
 *      (error); unused slots / stale docs (warning).
 *  10. (warning) `extends`/`uses.rules`/`uses.agents`/`template`         — deprecated-checks.ts
 *      references a `deprecated:` artifact.
 *  11. (warning) A skill points at a bundled path that doesn't ship     — skill-path-check.ts
 *      (`references/<missing>`, `assets/`, `scripts/`).
 */
import type { LoadedCatalog, Target, ValidationResult } from '../types';
import type { ValidateCtx } from './types';
import { checkSchema, checkReferenceIntegrity } from './schema-checks';
import { checkUnscopedAppliesTo, checkDuplicateAncestorScope } from './scope-checks';
import { checkHardcodedRunner } from './runner-check';
import { checkPlatforms, checkOwnedByKindConflicts } from './platform-checks';
import { detectExtendsCycles } from './cycles';
import { checkArtifactTemplate, checkTemplatesCatalogWide } from './template-checks';
import { checkDeprecatedReferences } from './deprecated-checks';
import { checkSkillPaths } from './skill-path-check';

export function validateCatalog(catalog: LoadedCatalog, knownTargets?: Target[]): ValidationResult {
  const ctx: ValidateCtx = { catalog, knownTargets, errors: [], warnings: [] };

  for (const artifact of catalog.artifacts) {
    if (!checkSchema(ctx, artifact)) continue;
    checkReferenceIntegrity(ctx, artifact);
    checkUnscopedAppliesTo(ctx, artifact);
    checkPlatforms(ctx, artifact);
    checkHardcodedRunner(ctx, artifact);
    checkArtifactTemplate(ctx, artifact);
    checkDeprecatedReferences(ctx, artifact);
    checkSkillPaths(ctx, artifact);
  }

  checkDuplicateAncestorScope(ctx);
  checkOwnedByKindConflicts(ctx);
  checkTemplatesCatalogWide(ctx);
  detectExtendsCycles(catalog, ctx.errors);

  return { valid: ctx.errors.length === 0, errors: ctx.errors, warnings: ctx.warnings };
}
