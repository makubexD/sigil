/**
 * id/path/language/kind naming-convention checkers plus reference-integrity checks
 * for check-source.ts. Split out of check-source.ts to keep that file under the
 * repo's own module-size threshold.
 *
 * @module
 */
import path from 'path';
import type { ArtifactKind } from '../types';
import { checkReferences, describeRefProblem, type RefCheck } from '../refs';
import { normPath } from '../paths';
import { locateSource, splitId } from '../catalog-layout';
import { kindOfSourceFile } from '../kinds';
import type { CheckCtx } from './check-source-ctx';

/** Renders one RefCheck in check-source.ts's established wording. */
function formatRefViolation(check: RefCheck): string {
  return `${check.field}: '${check.ref}' ${describeRefProblem(check)}`;
}

/** Returns true when `s` is kebab-case (lowercase letters, digits, hyphens). */
function isKebabCase(s: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);
}

/**
 * Infer the expected id prefix from the artifact's file path: `languages/<lang>/…` → `<lang>`,
 * `shared/…` → `shared`, undefined otherwise. Read relative to the catalog root when the catalog
 * has one (catalog-layout.ts), so folders above the root never count; a catalog built in memory has
 * no root and falls back to matching the segments anywhere in the path.
 */
function inferIdPrefixFromPath(filePath: string, catalogRoot?: string): string | undefined {
  if (catalogRoot) return locateSource(catalogRoot, filePath).namespace;
  const normalized = normPath(filePath);
  const langMatch = normalized.match(/\/languages\/([^/]+)\//);
  if (langMatch) return langMatch[1];
  if (normalized.includes('/shared/')) return 'shared';
  return undefined;
}

/**
 * Infer the expected kind from the file name pattern.
 * SKILL.md → 'skill'; *.rule.md → 'rule'; *.agent.md → 'agent'; etc.
 */
function inferKindFromPath(filePath: string): ArtifactKind | undefined {
  return kindOfSourceFile(path.basename(filePath));
}

/** name (skill/agent only) must be kebab-case and match the id's name segment. */
function checkNameConsistency(ctx: CheckCtx, idName: string): void {
  const { artifact, v } = ctx;
  const kindName = artifact.frontmatter.name as string | undefined;
  if (!(artifact.kind === 'skill' || artifact.kind === 'agent') || !kindName) return;

  if (!isKebabCase(kindName)) {
    v.push({
      file: artifact.filePath,
      problem: `name '${kindName}' must be kebab-case (lowercase letters, digits, hyphens)`,
    });
  }
  if (kindName !== idName) {
    v.push({
      file: artifact.filePath,
      problem: `name '${kindName}' must match the id name segment '${idName}'`,
    });
  }
}

/** frontmatter `language:` must match the id prefix. */
function checkLanguageMatchesId(ctx: CheckCtx, idPrefix: string, frontmatterLang: string): void {
  if (frontmatterLang === idPrefix || idPrefix === 'shared') return;
  ctx.v.push({
    file: ctx.artifact.filePath,
    problem: `frontmatter language '${frontmatterLang}' must match id prefix '${idPrefix}'`,
  });
}

/** frontmatter `language:` must match both the id prefix and the path-inferred language. */
function checkLanguageConsistency(
  ctx: CheckCtx,
  idPrefix: string,
  pathPrefix: string | undefined,
): void {
  const { artifact, v } = ctx;
  const frontmatterLang = artifact.frontmatter.language as string | undefined;
  if (!frontmatterLang) return;

  checkLanguageMatchesId(ctx, idPrefix, frontmatterLang);
  if (pathPrefix && pathPrefix !== 'shared' && pathPrefix !== frontmatterLang) {
    v.push({
      file: artifact.filePath,
      problem: `frontmatter language '${frontmatterLang}' doesn't match path-inferred language '${pathPrefix}'`,
    });
  }
}

/**
 * Validates the id shape (catalog-layout.ts `splitId`); returns [prefix, name] or pushes a violation
 * and null. A template's id is `<prefix>/templates/<name>`, the documented `templates/` sub-namespace.
 */
function requireTwoPartId(ctx: CheckCtx): [string, string] | null {
  const { artifact, v } = ctx;
  const split = splitId(artifact.id, artifact.kind);
  if (split) return [split.prefix, split.name];
  v.push({
    file: artifact.filePath,
    problem:
      artifact.kind === 'template'
        ? `template id '${artifact.id}' must follow the convention '<language>/templates/<name>' or 'shared/templates/<name>'`
        : `id '${artifact.id}' must follow the convention '<language>/<name>' or 'shared/<name>'`,
  });
  return null;
}

/** §2: id must be `<prefix>/<name>`; checks id↔path↔language↔kebab-case consistency. */
export function checkIdConsistency(ctx: CheckCtx): void {
  const parts = requireTwoPartId(ctx);
  if (!parts) return;
  const [idPrefix, idName] = parts;

  const file = ctx.artifact.filePath;
  const pathPrefix = inferIdPrefixFromPath(file, ctx.catalog.root);
  if (pathPrefix && pathPrefix !== idPrefix) {
    ctx.v.push({
      file,
      problem: `id prefix '${idPrefix}' doesn't match path inferred prefix '${pathPrefix}' — keep id and file path in sync`,
    });
  }

  checkNameConsistency(ctx, idName);
  checkLanguageConsistency(ctx, idPrefix, pathPrefix);
}

/** File-name-implied kind (SKILL.md / *.rule.md / etc.) must match frontmatter `kind`. */
export function checkKindMatchesPath(ctx: CheckCtx): void {
  const { artifact, v } = ctx;
  const pathKind = inferKindFromPath(artifact.filePath);
  if (pathKind && pathKind !== artifact.kind) {
    v.push({
      file: artifact.filePath,
      problem: `file name implies kind '${pathKind}' but frontmatter declares kind '${artifact.kind}'`,
    });
  }
}

/**
 * §3: duplicate id. Normalise path separators before comparing — on Windows the
 * catalog may use forward slashes while destPath uses backslashes, causing
 * false-positive duplicates on --overwrite.
 */
export function checkDuplicateId(ctx: CheckCtx): void {
  const { artifact, catalog, v } = ctx;
  const existing = catalog.byId.get(artifact.id);
  if (!existing) return;
  const normExisting = normPath(existing.filePath);
  const normArtifact = normPath(artifact.filePath);
  if (normExisting !== normArtifact) {
    v.push({
      file: artifact.filePath,
      problem: `Duplicate id '${artifact.id}' — already used by ${existing.filePath}`,
    });
  }
}

function checkWorkflowStepRefs(ctx: CheckCtx): void {
  const { artifact, catalog, v } = ctx;
  const file = artifact.filePath;
  const steps = artifact.frontmatter.steps as Array<{ ref: string }> | undefined;
  for (const step of steps ?? []) {
    if (!catalog.byId.has(step.ref)) {
      v.push({ file, problem: `workflow step ref '${step.ref}' does not exist in the catalog` });
    }
  }
}

function checkRelatedArtifactRefs(ctx: CheckCtx): void {
  const { artifact, catalog, v } = ctx;
  const file = artifact.filePath;
  const related = artifact.frontmatter.relatedArtifacts as
    | Array<{ id: string; relation: string; reason: string }>
    | undefined;
  for (const entry of related ?? []) {
    if (!catalog.byId.has(entry.id)) {
      v.push({ file, problem: `relatedArtifacts: '${entry.id}' does not exist in the catalog` });
    }
  }
}

/** §4: extends / uses.rules / uses.agents / workflow steps / relatedArtifacts references. */
export function checkReferenceIntegrity(ctx: CheckCtx): void {
  const { artifact, catalog, v } = ctx;
  const file = artifact.filePath;

  for (const check of checkReferences(artifact.frontmatter, catalog)) {
    v.push({ file, problem: formatRefViolation(check) });
  }
  checkWorkflowStepRefs(ctx);
  checkRelatedArtifactRefs(ctx);
}
