/**
 * Source-side artifact validator.
 *
 * The mirror of src/targets/output-contract.ts: while that module checks emitted
 * file shapes (post-compile), this module checks source `.md` files against:
 *   1. The zod schema for the artifact's kind (the single source of truth).
 *   2. Source-convention rules: id↔path↔language consistency, kebab-case names,
 *      duplicate-id detection, valid cross-references.
 *   3. Platform sanity: `platforms:` lists only real, kind-supporting targets.
 *   4. Dependency coverage drift: a skill targeting platform P must not reference
 *      deps (rules/agents) restricted to a platform P does not include.
 *
 * Used by:
 *   - `sigil check <file>`  — explicit single-file validation
 *   - `sigil new`           — auto-run after scaffolding
 *   - `sigil retarget`      — validate the mutated artifact before saving
 */
import path from 'path';
import type { Artifact, LoadedCatalog, SourceViolation } from '../types';
import { getSchema } from '../schema/index';
import { artifactTargetsPlatform } from '../select';
import type { Target, ArtifactKind } from '../types';

// ─── Convention checkers ──────────────────────────────────────────────────────

/** Returns true when `s` is kebab-case (lowercase letters, digits, hyphens). */
function isKebabCase(s: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);
}

/**
 * Infer the expected id prefix from the artifact's file path.
 * Looks for the pattern: catalog/languages/<lang>/... → prefix = <lang>
 *                         catalog/shared/...           → prefix = "shared"
 * Returns undefined when the path doesn't match either convention.
 */
function inferIdPrefixFromPath(filePath: string): string | undefined {
  // Normalise to forward slashes for cross-platform matching
  const normalized = filePath.replace(/\\/g, '/');
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
  const base = path.basename(filePath);
  if (base === 'SKILL.md') return 'skill';
  if (base.endsWith('.rule.md')) return 'rule';
  if (base.endsWith('.agent.md')) return 'agent';
  if (base.endsWith('.prompt.md')) return 'prompt';
  if (base.endsWith('.workflow.md')) return 'workflow';
  return undefined;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface CheckSourceOptions {
  /** When true, only run schema validation (skip path/id/language/reference checks). */
  schemaOnly?: boolean;
}

/**
 * Check a single artifact against schema + source conventions.
 *
 * @param artifact   A loaded artifact (from loadCatalog or hand-constructed for a new file).
 * @param catalog    The full loaded catalog (needed for duplicate-id and reference checks).
 * @param targets    All registered targets (needed for `platforms:` validation).
 * @param opts       Optional strictness overrides.
 * @returns          Array of violations; empty = clean.
 */
export function checkSourceArtifact(
  artifact: Artifact,
  catalog: LoadedCatalog,
  targets: Target[],
  opts: CheckSourceOptions = {},
): SourceViolation[] {
  const v: SourceViolation[] = [];
  const file = artifact.filePath;

  // ── 1. Schema validation ───────────────────────────────────────────────────
  let schema;
  try {
    schema = getSchema(artifact.kind);
  } catch {
    v.push({ file, problem: `Unknown kind '${artifact.kind}'` });
    return v; // can't do any further checks
  }

  const parseResult = schema.safeParse(artifact.frontmatter);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      const fieldPath = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      v.push({ file, problem: `Schema: ${fieldPath} — ${issue.message}` });
    }
  }

  if (opts.schemaOnly) return v;

  // ── 2. id/path/language consistency ───────────────────────────────────────
  const id = artifact.id;
  const parts = id.split('/');

  // id must be exactly "<prefix>/<name>" (two parts)
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    v.push({
      file,
      problem: `id '${id}' must follow the convention '<language>/<name>' or 'shared/<name>'`,
    });
  } else {
    const [idPrefix, idName] = parts;

    // Check path consistency (when the path is interpretable)
    const pathPrefix = inferIdPrefixFromPath(file);
    if (pathPrefix && pathPrefix !== idPrefix) {
      v.push({
        file,
        problem: `id prefix '${idPrefix}' doesn't match path inferred prefix '${pathPrefix}' — keep id and file path in sync`,
      });
    }

    // name kebab-case (skill and agent only)
    const kindName = artifact.frontmatter.name as string | undefined;
    if ((artifact.kind === 'skill' || artifact.kind === 'agent') && kindName) {
      if (!isKebabCase(kindName)) {
        v.push({
          file,
          problem: `name '${kindName}' must be kebab-case (lowercase letters, digits, hyphens)`,
        });
      }
      // name must match the last path segment of the id
      if (kindName !== idName) {
        v.push({ file, problem: `name '${kindName}' must match the id name segment '${idName}'` });
      }
    }

    // language must match the id prefix (for language-scoped artifacts)
    const frontmatterLang = artifact.frontmatter.language as string | undefined;
    if (frontmatterLang) {
      if (frontmatterLang !== idPrefix && idPrefix !== 'shared') {
        v.push({
          file,
          problem: `frontmatter language '${frontmatterLang}' must match id prefix '${idPrefix}'`,
        });
      }
      // path inferred prefix must also match
      if (pathPrefix && pathPrefix !== 'shared' && pathPrefix !== frontmatterLang) {
        v.push({
          file,
          problem: `frontmatter language '${frontmatterLang}' doesn't match path-inferred language '${pathPrefix}'`,
        });
      }
    }
  }

  // kind consistency with file name
  const pathKind = inferKindFromPath(file);
  if (pathKind && pathKind !== artifact.kind) {
    v.push({
      file,
      problem: `file name implies kind '${pathKind}' but frontmatter declares kind '${artifact.kind}'`,
    });
  }

  // ── 3. Duplicate id ────────────────────────────────────────────────────────
  // If the catalog already has this id AND it refers to a different file, it's a duplicate.
  const existing = catalog.byId.get(id);
  if (existing && existing.filePath !== artifact.filePath) {
    v.push({
      file,
      problem: `Duplicate id '${id}' — already used by ${existing.filePath}`,
    });
  }

  // ── 4. Reference integrity ─────────────────────────────────────────────────
  // extends
  const extendsRefs = (artifact.frontmatter.extends as string[] | undefined) ?? [];
  for (const ref of extendsRefs) {
    const target = catalog.byId.get(ref);
    if (!target) {
      v.push({ file, problem: `extends: '${ref}' does not exist in the catalog` });
    } else if (target.kind !== 'rule') {
      v.push({
        file,
        problem: `extends: '${ref}' has kind '${target.kind}' — only rules can be extended`,
      });
    }
  }

  // uses.rules + uses.agents
  const uses = artifact.frontmatter.uses as { rules?: string[]; agents?: string[] } | undefined;
  for (const ref of uses?.rules ?? []) {
    const target = catalog.byId.get(ref);
    if (!target) {
      v.push({ file, problem: `uses.rules: '${ref}' does not exist in the catalog` });
    } else if (target.kind !== 'rule') {
      v.push({
        file,
        problem: `uses.rules: '${ref}' has kind '${target.kind}' — only rules valid here`,
      });
    }
  }
  for (const ref of uses?.agents ?? []) {
    const target = catalog.byId.get(ref);
    if (!target) {
      v.push({ file, problem: `uses.agents: '${ref}' does not exist in the catalog` });
    } else if (target.kind !== 'agent') {
      v.push({
        file,
        problem: `uses.agents: '${ref}' has kind '${target.kind}' — only agents valid here`,
      });
    }
  }

  // workflow steps
  const steps = artifact.frontmatter.steps as Array<{ ref: string }> | undefined;
  for (const step of steps ?? []) {
    if (!catalog.byId.has(step.ref)) {
      v.push({ file, problem: `workflow step ref '${step.ref}' does not exist in the catalog` });
    }
  }

  // ── 5. platforms: field validation ────────────────────────────────────────
  const platforms = artifact.frontmatter.platforms as string[] | undefined;
  if (platforms && platforms.length > 0) {
    const allTargetNames = new Set(targets.map(t => t.name));
    const kindSupporting = new Set(
      targets
        .filter(t => !t.supportedKinds || t.supportedKinds.includes(artifact.kind as ArtifactKind))
        .map(t => t.name),
    );

    for (const p of platforms) {
      if (!allTargetNames.has(p)) {
        v.push({
          file,
          problem: `platforms: '${p}' is not a registered target. Known targets: ${[...allTargetNames].join(', ')}`,
        });
      } else if (!kindSupporting.has(p)) {
        v.push({ file, problem: `platforms: '${p}' does not support kind '${artifact.kind}'` });
      }
    }

    // ── 6. Dependency coverage drift ────────────────────────────────────────
    // Warn (as a violation) when a dep is restricted to fewer platforms than the skill itself.
    // This is a warning-class violation; we emit it so the user is aware.
    for (const ref of uses?.rules ?? []) {
      const dep = catalog.byId.get(ref);
      if (!dep) continue; // already reported above
      const depPlatforms = dep.frontmatter.platforms as string[] | undefined;
      if (!depPlatforms || depPlatforms.length === 0) continue; // dep is universal — fine
      const missingForDep = platforms.filter(p => !depPlatforms.includes(p));
      if (missingForDep.length > 0) {
        v.push({
          file,
          problem: `Dependency coverage drift: rule '${ref}' is restricted to [${depPlatforms.join(', ')}] but this skill targets [${platforms.join(', ')}] — '${ref}' won't be available on: ${missingForDep.join(', ')}`,
        });
      }
    }
    for (const ref of uses?.agents ?? []) {
      const dep = catalog.byId.get(ref);
      if (!dep) continue;
      const depPlatforms = dep.frontmatter.platforms as string[] | undefined;
      if (!depPlatforms || depPlatforms.length === 0) continue;
      const missingForDep = platforms.filter(p => !depPlatforms.includes(p));
      if (missingForDep.length > 0) {
        v.push({
          file,
          problem: `Dependency coverage drift: agent '${ref}' is restricted to [${depPlatforms.join(', ')}] but this skill targets [${platforms.join(', ')}] — '${ref}' won't be available on: ${missingForDep.join(', ')}`,
        });
      }
    }
  }

  return v;
}
