/**
 * `deprecated-hygiene` — an artifact marked `deprecated:` should also carry `supersededBy`, so
 * `sigil prune` and `sigil list`/`get` have a concrete replacement to point consumers at instead
 * of just "this is retired." No `fix()`: naming the correct replacement artifact is an editorial
 * judgment (which sibling actually replaces this one), not a deterministic derivation — a rule
 * this narrow isn't worth a full editorial round-trip either, so it stays report-only.
 *
 * Zero findings today (no catalog artifact currently authors `deprecated:`) — this rule is
 * forward-looking hygiene for the next deprecation, per the lifecycle table in the audit's
 * decision log.
 *
 * @module
 */
import type { ConformanceRule, ConformanceFinding } from '../types';

interface DeprecatedFrontmatter {
  readonly since?: string;
  readonly reason?: string;
  readonly supersededBy?: string;
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const artifact of ctx.catalog.artifacts) {
    const dep = artifact.frontmatter.deprecated as DeprecatedFrontmatter | undefined;
    if (!dep) continue;
    if (dep.supersededBy) continue;
    findings.push({
      ruleId: 'deprecated-hygiene',
      severity: 'warning',
      artifactId: artifact.id,
      filePath: artifact.filePath,
      detail: 'deprecated artifact has no supersededBy — sigil prune cannot suggest a replacement',
    });
  }
  return findings;
}

export const deprecatedHygieneRule: ConformanceRule = {
  id: 'deprecated-hygiene',
  title: 'Deprecated artifacts should name a supersededBy replacement',
  class: 'mechanical',
  appliesTo: {},
  rationale:
    'A deprecated artifact without supersededBy gives consumers nothing concrete to migrate to.',
  detect,
};
