/**
 * `applies-to-rationale` — a rule with a non-default `appliesTo` glob (i.e. scoped to something
 * narrower than every file) should explain why via `appliesToRationale`, so a reader doesn't have
 * to reverse-engineer the scoping from the glob alone. Authoring that one-sentence explanation is
 * editorial judgment, not a deterministic derivation from the glob.
 *
 * @module
 */
import type { ConformanceRule, ConformanceFinding, EditorialTask } from '../types';

const DEFAULT_APPLIES_TO = '**/*';

function isDefaultScope(appliesTo: readonly string[]): boolean {
  return appliesTo.length === 1 && appliesTo[0] === DEFAULT_APPLIES_TO;
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];
  for (const artifact of ctx.catalog.artifacts) {
    if (artifact.kind !== 'rule') continue;
    const appliesTo = artifact.frontmatter.appliesTo as string[] | undefined;
    if (!appliesTo || appliesTo.length === 0 || isDefaultScope(appliesTo)) continue;
    if (typeof artifact.frontmatter.appliesToRationale === 'string') continue;
    findings.push({
      ruleId: 'applies-to-rationale',
      severity: 'warning',
      artifactId: artifact.id,
      filePath: artifact.filePath,
      detail: `appliesTo: ${JSON.stringify(appliesTo)} has no appliesToRationale explaining the scoping`,
    });
  }
  return findings;
}

function editorialTask(
  finding: ConformanceFinding,
  ctx: Parameters<ConformanceRule['detect']>[0],
): EditorialTask | undefined {
  if (!finding.artifactId || !finding.filePath) return undefined;
  const artifact = ctx.catalog.byId.get(finding.artifactId);
  if (!artifact) return undefined;
  const appliesTo = artifact.frontmatter.appliesTo as string[] | undefined;
  return {
    artifactId: finding.artifactId,
    filePath: finding.filePath,
    kind: 'rule',
    instruction:
      `Author a one-sentence appliesToRationale for this rule's appliesTo: ` +
      `${JSON.stringify(appliesTo)}, explaining in plain language why the rule is scoped to ` +
      "those paths rather than every file. Base it on the rule's actual title/body content — " +
      "do not guess if the body doesn't make the reason clear.",
    ownedFields: ['appliesToRationale'],
  };
}

export const appliesToRationaleRule: ConformanceRule = {
  id: 'applies-to-rationale',
  title: 'Non-default appliesTo should explain its scoping',
  class: 'editorial',
  appliesTo: { kinds: ['rule'] },
  rationale:
    'A narrow appliesTo glob without a rationale forces a reader to reverse-engineer the ' +
    'scoping intent from the glob alone.',
  detect,
  editorialTask,
};
