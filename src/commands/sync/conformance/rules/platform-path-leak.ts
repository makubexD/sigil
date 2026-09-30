/**
 * `platform-path-leak` — a skill/rule/agent/prompt/workflow body that hardcodes `.claude/` in
 * prose ("Read any .md files under .claude/") ships that path verbatim into Copilot's `.github/`
 * output too, where it doesn't exist. `hook`/`settings` are exempt — those kinds are
 * `ownedBy: ['claude']` (src/kinds.ts), so `.claude/` in their bodies is accurate, not a leak.
 * Rewriting to provider-neutral phrasing needs judgment (what to say instead) — `editorial`.
 *
 * @module
 */
import type { ArtifactKind } from '../../../../types';
import type { ConformanceRule, ConformanceFinding, EditorialTask } from '../types';

const PLATFORM_PATH_RE = /\.claude\//;
const EXEMPT_KINDS: ReadonlySet<ArtifactKind> = new Set(['hook', 'settings']);

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const artifact of ctx.catalog.artifacts) {
    if (EXEMPT_KINDS.has(artifact.kind)) continue;
    if (!PLATFORM_PATH_RE.test(artifact.body)) continue;
    findings.push({
      ruleId: 'platform-path-leak',
      severity: 'warning',
      artifactId: artifact.id,
      filePath: artifact.filePath,
      provider: 'copilot',
      detail:
        "body references .claude/ verbatim — ships unchanged into Copilot's .github/ output " +
        'where the path does not exist',
    });
  }
  return findings;
}

const REWRITE_INSTRUCTION =
  'Rewrite every mention of ".claude/" in the body to provider-neutral phrasing — e.g. ' +
  '"the project\'s documented conventions and any rules files present" instead of ' +
  '"CLAUDE.md and .claude/ rules if present". Preserve the surrounding sentence\'s meaning ' +
  'and any other file paths that are genuinely provider-neutral (CLAUDE.md itself is fine ' +
  'to keep since Claude Code, not sigil, defines that convention; only .claude/ paths are ' +
  'the leak). Do not change anything else in the body.';

function editorialTask(
  finding: ConformanceFinding,
  ctx: Parameters<ConformanceRule['detect']>[0],
): EditorialTask | undefined {
  if (!finding.artifactId || !finding.filePath) return undefined;
  const artifact = ctx.catalog.byId.get(finding.artifactId);
  if (!artifact) return undefined;
  return {
    artifactId: finding.artifactId,
    filePath: finding.filePath,
    kind: artifact.kind,
    instruction: REWRITE_INSTRUCTION,
    ownedFields: ['body'],
  };
}

export const platformPathLeakRule: ConformanceRule = {
  id: 'platform-path-leak',
  title: 'Body prose must not hardcode .claude/ paths',
  class: 'editorial',
  appliesTo: {},
  rationale:
    'An artifact emitting to both Claude and Copilot must read correctly on both — a hardcoded ' +
    '.claude/ path is accurate on one and nonsense on the other.',
  detect,
  editorialTask,
};
