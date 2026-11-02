/**
 * `family-tools` — every member of an agent family names the family's neutral tools
 * (`tools.allow`) and its policy (`tools.policy`, default `strict`), and every member of a skill
 * family names the family's `allowedTools`. Member lists are compared as normalized SETS, so
 * `[Read, Grep, Glob]` matches `[read, search]`; a list naming an unknown tool differs even when
 * its neutral set matches. A member listed in `toolExceptions` is skipped (the reason is the
 * author's), and a family that declares no tool default is not checked.
 *
 * `mechanical`: the fix only fills what the member leaves absent — a missing list is written in
 * family order, and a missing `toolPolicy` becomes `nearest` when the family asks for it. A value
 * the member already wrote is never rewritten; that difference stays a finding.
 *
 * Author-only, like `family-skeleton`: a catalog without `standard.yaml`, or built in memory, is
 * skipped.
 *
 * @module
 */
import type { Artifact, LoadedCatalog } from '../../../../types';
import type { ArtifactEdit, ConformanceFinding, ConformanceRule } from '../types';
import {
  loadCatalogStandard,
  type CatalogStandard,
  type FamilyDef,
} from '../../../../catalog-standard';
import { normalizeTools, type NeutralTool } from '../../../../tool-vocabulary';

const RULE_ID = 'family-tools';

/** The frontmatter field and value a family sets for its members. */
interface ToolDefault {
  readonly field: string;
  readonly expected: readonly NeutralTool[];
}

/** The field and value a family sets for its members, or undefined when it sets none. */
function toolDefault(family: FamilyDef): ToolDefault | undefined {
  if (family.kind === 'agent' && family.tools) {
    return { field: 'tools', expected: family.tools.allow };
  }
  if (family.kind === 'skill' && family.allowedTools) {
    return { field: 'allowedTools', expected: family.allowedTools };
  }
  return undefined;
}

/** Problems with a member's authored tool list against the family's, after normalization. */
function listProblems(
  field: string,
  family: FamilyDef,
  expected: readonly NeutralTool[],
  authored: unknown,
): string[] {
  if (!Array.isArray(authored)) {
    return [`missing ${field}; family '${family.id}' sets [${expected.join(', ')}]`];
  }
  const names = authored.filter((entry): entry is string => typeof entry === 'string');
  const { tools, unknown } = normalizeTools(names);
  const allow = new Set(expected);
  const same = tools.length === allow.size && tools.every(tool => allow.has(tool));
  if (same && unknown.length === 0) return [];
  const base = `${field} [${names.join(', ')}] differ from family '${family.id}' [${expected.join(', ')}]`;
  return [unknown.length > 0 ? `${base}; unknown: ${unknown.join(', ')}` : base];
}

/** Problems with an agent's tool policy against the family's (both default to `strict`). */
function policyProblems(family: FamilyDef, authored: unknown): string[] {
  const member = authored ?? 'strict';
  const familyPolicy = family.tools?.policy ?? 'strict';
  if (member === familyPolicy) return [];
  return [`toolPolicy '${String(member)}' differs from family '${family.id}' '${familyPolicy}'`];
}

/** Every problem with one member's tool list, as one joined detail line. */
function memberProblems(
  family: FamilyDef,
  artifact: Artifact,
  field: string,
  expected: readonly NeutralTool[],
): string[] {
  const problems = listProblems(field, family, expected, artifact.frontmatter[field]);
  if (family.kind !== 'agent') return problems;
  return [...problems, ...policyProblems(family, artifact.frontmatter.toolPolicy)];
}

/** The finding for one member, or undefined when it matches, is an exception or is not in the catalog. */
function memberFinding(
  family: FamilyDef,
  id: string,
  catalog: Pick<LoadedCatalog, 'byId'>,
  tool: ToolDefault,
): ConformanceFinding | undefined {
  if (Object.hasOwn(family.toolExceptions, id)) return undefined;
  const artifact = catalog.byId.get(id);
  if (!artifact || artifact.kind !== family.kind) return undefined;
  const problems = memberProblems(family, artifact, tool.field, tool.expected);
  if (problems.length === 0) return undefined;
  return {
    ruleId: RULE_ID,
    severity: 'error',
    artifactId: artifact.id,
    filePath: artifact.filePath,
    detail: problems.join('; '),
  };
}

/** Every `family-tools` finding for `standard` against `catalog`, one per member at most. */
export function familyToolFindings(
  standard: CatalogStandard,
  catalog: Pick<LoadedCatalog, 'byId'>,
): ConformanceFinding[] {
  return standard.families.flatMap(family => {
    const tool = toolDefault(family);
    if (!tool) return [];
    return family.members.flatMap(id => memberFinding(family, id, catalog, tool) ?? []);
  });
}

/** The values the member leaves absent: its tool list, and an agent's `nearest` policy. */
function absentPatch(family: FamilyDef, artifact: Artifact): Record<string, unknown> | undefined {
  const patch: Record<string, unknown> = {};
  if (family.kind === 'agent' && family.tools) {
    if (artifact.frontmatter.tools === undefined) patch.tools = [...family.tools.allow];
    if (family.tools.policy === 'nearest' && artifact.frontmatter.toolPolicy === undefined) {
      patch.toolPolicy = 'nearest';
    }
  }
  const allowed = family.kind === 'skill' ? family.allowedTools : undefined;
  if (allowed && artifact.frontmatter.allowedTools === undefined) {
    patch.allowedTools = [...allowed];
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
}

/** The family a member belongs to, or undefined when none lists it. */
function familyOf(standard: CatalogStandard, artifact: Artifact): FamilyDef | undefined {
  return standard.families.find(
    family => family.kind === artifact.kind && family.members.includes(artifact.id),
  );
}

function detect(ctx: Parameters<ConformanceRule['detect']>[0]): ConformanceFinding[] {
  const { catalog } = ctx;
  if (!catalog.root) return [];
  const standard = loadCatalogStandard(catalog.root);
  return standard ? familyToolFindings(standard, catalog) : [];
}

function fix(
  finding: ConformanceFinding,
  ctx: Parameters<ConformanceRule['detect']>[0],
): ArtifactEdit | undefined {
  if (!finding.artifactId || !ctx.catalog.root) return undefined;
  const artifact = ctx.catalog.byId.get(finding.artifactId);
  if (!artifact) return undefined;
  const standard = loadCatalogStandard(ctx.catalog.root);
  const family = standard && familyOf(standard, artifact);
  const patch = family && absentPatch(family, artifact);
  if (!patch) return undefined;
  return { artifactId: artifact.id, filePath: artifact.filePath, frontmatterPatch: patch };
}

export const familyToolsRule: ConformanceRule = {
  id: RULE_ID,
  title: "A family member names the family's neutral tools",
  class: 'mechanical',
  appliesTo: { kinds: ['agent', 'skill'] },
  rationale:
    'A family fixes the neutral tools its members all need, so a sibling language version ' +
    'cannot silently widen or narrow the capability every target renders.',
  detect,
  fix,
};
