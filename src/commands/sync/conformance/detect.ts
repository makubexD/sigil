/**
 * Runs the conformance rule registry over a catalog, with the scoping filters `sigil sync`
 * exposes for mass-change review (`--rule`, `--kind`, `--language`, `--provider`) — bring one
 * language up to standard, or one rule across the whole catalog, and review each as its own diff.
 *
 * @module
 */
import type { ArtifactKind, LoadedCatalog, Target } from '../../../types';
import { CONFORMANCE_RULES } from './registry';
import type { ConformanceContext, ConformanceFinding, ConformanceRule } from './types';

export interface ConformanceRunOptions {
  readonly ruleId?: string | undefined;
  readonly kind?: ArtifactKind | undefined;
  readonly language?: string | undefined;
  readonly provider?: string | undefined;
}

function ruleMatchesScope(rule: ConformanceRule, opts: ConformanceRunOptions): boolean {
  if (opts.ruleId && rule.id !== opts.ruleId) return false;
  if (opts.kind && rule.appliesTo.kinds && !rule.appliesTo.kinds.includes(opts.kind)) return false;
  if (
    opts.provider &&
    rule.appliesTo.providers &&
    !rule.appliesTo.providers.includes(opts.provider)
  ) {
    return false;
  }
  return true;
}

/** A finding matches --kind/--language/--provider when its artifact (if any) is in scope. */
function findingMatchesScope(
  finding: ConformanceFinding,
  catalog: LoadedCatalog,
  opts: ConformanceRunOptions,
): boolean {
  if (opts.provider && finding.provider && finding.provider !== opts.provider) return false;
  if (!finding.artifactId) return true; // catalog/target-level finding — no kind/language to check
  const artifact = catalog.byId.get(finding.artifactId);
  if (!artifact) return true;
  if (opts.kind && artifact.kind !== opts.kind) return false;
  if (opts.language && artifact.frontmatter.language !== opts.language) return false;
  return true;
}

/** Runs every scope-matching rule's detect() and filters findings to the same scope. */
export function runConformance(
  catalog: LoadedCatalog,
  targets: readonly Target[],
  opts: ConformanceRunOptions = {},
): ConformanceFinding[] {
  const ctx: ConformanceContext = { catalog, targets };
  const rules = CONFORMANCE_RULES.filter(rule => ruleMatchesScope(rule, opts));
  return rules.flatMap(rule =>
    rule.detect(ctx).filter(finding => findingMatchesScope(finding, catalog, opts)),
  );
}
