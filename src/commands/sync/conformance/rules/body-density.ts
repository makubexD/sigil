/**
 * `body-density` — a skill body re-teaching general concepts (what a unit test is, what CVEs are)
 * instead of staying procedural bloats past the ~90-line band the elevated TypeScript skills sit
 * in (`typescript/ts-audit-deps` and siblings). `csharp/cs-scaffold-project` at 195 lines against
 * `typescript/ts-scaffold-project`'s 77 for the same shape is the concrete outlier this rule
 * targets. Trimming without losing real procedural content needs judgment — `editorial`.
 *
 * @module
 */
import type { ConformanceRule, ConformanceFinding, EditorialTask } from '../types';

const EXEMPLAR_ID = 'typescript/ts-audit-deps';
/** Elevated TypeScript skills average ~90 lines; flag meaningfully above that band. */
const BODY_DENSITY_LINE_THRESHOLD = 100;

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const artifact of ctx.catalog.artifacts) {
    if (artifact.kind !== 'skill') continue;
    const lineCount = artifact.body.split(/\r?\n/).length;
    if (lineCount <= BODY_DENSITY_LINE_THRESHOLD) continue;
    findings.push({
      ruleId: 'body-density',
      severity: 'warning',
      artifactId: artifact.id,
      filePath: artifact.filePath,
      detail: `body is ${lineCount} lines (target ~90, exemplar: ${EXEMPLAR_ID})`,
    });
  }
  return findings;
}

function editorialTask(finding: ConformanceFinding): EditorialTask | undefined {
  if (!finding.artifactId || !finding.filePath) return undefined;
  return {
    artifactId: finding.artifactId,
    filePath: finding.filePath,
    kind: 'skill',
    instruction:
      `Trim this skill body toward the ~90-line density of ${EXEMPLAR_ID} — remove prose that ` +
      're-teaches general concepts the model already knows (what a unit test is, what a CVE is, ' +
      'generic best-practice explanations), while preserving every concrete procedural step, ' +
      'command, file path, and project-specific convention verbatim. Do not remove content that ' +
      "is specific to this skill's actual procedure — only generic re-teaching.",
    ownedFields: ['body'],
  };
}

export const bodyDensityRule: ConformanceRule = {
  id: 'body-density',
  title: 'Skill bodies should stay procedural, not re-teach general concepts',
  class: 'editorial',
  appliesTo: { kinds: ['skill'] },
  rationale:
    'Re-teaching prose bloats the body without adding procedural value the model needs — the ' +
    `elevated TypeScript skills (~90 lines, exemplar ${EXEMPLAR_ID}) show the achievable density.`,
  detect,
  editorialTask,
};
