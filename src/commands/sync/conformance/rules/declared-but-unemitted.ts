/**
 * `declared-but-unemitted` — a frontmatter key that is authored on catalog artifacts of some kind
 * but never appears as a `from:` in any registered `KindEmitSpec` for that kind, on any provider.
 * An authored-but-unmapped field silently vanishes at build time; the author believes it took
 * effect (schema validation passed) but no provider ever sees it.
 *
 * The concrete defect this rule exists to catch: `tools` (AgentSchema, schema/index.ts) was
 * authored on ~26 agent artifacts describing the exact tool scope an auditor/debugger/etc. should
 * have — several of them explicitly read-only in their own `description`. Neither
 * CLAUDE_AGENT_SPEC nor COPILOT_AGENT_SPEC mapped it, so every emitted agent silently inherited
 * every tool (both providers' documented default for an absent `tools`), including Write/Edit on
 * artifacts whose description promises read-only behavior. Fixed 2026-08-10 by wiring `tools` into
 * both specs — see claude-code/spec/agent.ts and copilot/spec/agent.ts. This rule is what would
 * have caught the gap on day one, and prevents its recurrence for any future field.
 *
 * No `fix()`: closing a real gap means writing a FieldMapping in a provider's spec file — a design
 * decision (what provider syntax, what default-gating), not something safe to generate unattended.
 *
 * @module
 */
import type { ArtifactKind } from '../../../../types';
import type { ConformanceRule, ConformanceFinding } from '../types';
import { ALL_PROVIDER_SPECS } from '../../../../targets/all-emit-specs';

/**
 * Scope: the whole-file kinds that render through a `KindEmitSpec`'s `FieldMapping[]` at all.
 * `hook`/`settings`/`mcp` are JSON merges (config-merge/*.ts), never a markdown render with a
 * frontmatter `FieldMapping` table — every one of their fields would look "unmapped" here, which
 * is a scoping bug in this rule, not a real gap. `provider-kind-coverage` uses this exact set for
 * the same reason (see its header + CLAUDE.md's "Every whole-file kind" invariant).
 */
const WHOLE_FILE_KINDS: ReadonlySet<ArtifactKind> = new Set([
  'skill',
  'agent',
  'rule',
  'prompt',
  'workflow',
]);

/**
 * Fields that are deliberately sigil-internal — they drive the resolver, `sigil search/get`, the
 * wizard, or cross-artifact wiring, and are never expected to reach a provider's frontmatter
 * directly (some are inlined into the body instead, e.g. `uses.rules` bodies under "## Applied
 * Rules"; some are pure catalog metadata, e.g. `tags`).
 */
const SIGIL_INTERNAL_FIELDS: ReadonlySet<string> = new Set([
  'id',
  'kind',
  'title',
  'description', // BaseFields, required on every kind — powers sigil search/get even where a
  // kind's spec doesn't emit it verbatim to a provider (e.g. rule: only its title is inlined).
  'tags',
  'language',
  'uses',
  'extends',
  'template',
  'platforms',
  'deprecated',
  'relatedArtifacts',
  'appliesToRationale',
  'severity',
  'slots',
  'revision',
  'docs',
  'conditionals',
  'appliesToKind',
]);

/** Top-level authored frontmatter keys for one artifact — dot-path nested fields are not walked. */
function authoredKeys(frontmatter: Record<string, unknown>): string[] {
  return Object.keys(frontmatter).filter(key => frontmatter[key] !== undefined);
}

/** The set of frontmatter keys any registered spec for this kind actually maps (`from:`, root segment). */
function mappedKeysForKind(kind: ArtifactKind): Set<string> {
  const mapped = new Set<string>();
  for (const { spec } of ALL_PROVIDER_SPECS) {
    if (spec.kind !== kind) continue;
    for (const mapping of spec.frontmatter) {
      mapped.add(mapping.from.split('.')[0] ?? mapping.from);
    }
  }
  return mapped;
}

/** Findings for one artifact's unmapped frontmatter keys, given that kind's mapped-key set. */
function findingsForArtifact(
  artifact: Parameters<ConformanceRule['detect']>[0]['catalog']['artifacts'][number],
  mapped: ReadonlySet<string>,
): ConformanceFinding[] {
  const unmapped = authoredKeys(artifact.frontmatter).filter(
    key => !SIGIL_INTERNAL_FIELDS.has(key) && !mapped.has(key),
  );
  return unmapped.map(key => ({
    ruleId: 'declared-but-unemitted',
    severity: 'error' as const,
    artifactId: artifact.id,
    filePath: artifact.filePath,
    detail:
      `frontmatter key '${key}' is authored but no registered KindEmitSpec for kind ` +
      `'${artifact.kind}' maps it — it is silently dropped at build time on every provider`,
  }));
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const mappedByKind = new Map<ArtifactKind, Set<string>>();
  const findings: ConformanceFinding[] = [];

  for (const artifact of ctx.catalog.artifacts) {
    if (!WHOLE_FILE_KINDS.has(artifact.kind)) continue;
    let mapped = mappedByKind.get(artifact.kind);
    if (!mapped) {
      mapped = mappedKeysForKind(artifact.kind);
      mappedByKind.set(artifact.kind, mapped);
    }
    findings.push(...findingsForArtifact(artifact, mapped));
  }
  return findings;
}

export const declaredButUnemittedRule: ConformanceRule = {
  id: 'declared-but-unemitted',
  title: 'Every authored frontmatter field must be mapped by at least one KindEmitSpec',
  class: 'mechanical',
  appliesTo: { kinds: ['skill', 'agent', 'rule', 'prompt', 'workflow'] },
  rationale:
    'A field authored in catalog source but unmapped by any provider spec silently vanishes at ' +
    'build time — the schema accepts it, so the author has no signal that it never took effect.',
  detect,
};
