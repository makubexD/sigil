/**
 * Claude Code `skill` emission spec — declarative counterpart to the logic that used to live
 * only in plugin-build.ts's buildPluginSkillMd(). Two variants share one field-mapping table:
 *   - 'plugin'   → dist/claude/plugins/<pack>/skills/<name>/SKILL.md, rule bodies inlined
 *                  under "## Applied Rules" (plugins cannot ship loose rule files).
 *   - 'scaffold' → .claude/skills/<name>/SKILL.md in a consumer project, rules NOT inlined
 *                  (.claude/rules/*.md are loaded natively instead).
 *
 * outputPath here documents the shape for deriveContracts()/audit tooling; the actual path
 * strings at call sites (plugin-assemble.ts's pack-prefix, scaffold.ts) are unchanged.
 */
import type { KindEmitSpec, FieldMapping, BodySectionSpec } from '../../spec-types';
import type { ResolvedArtifact } from '../../../types';
import { yamlScalar } from '../../yaml-util';
import { CLAUDE_SKILLS_DOC } from '../../doc-refs';

const nameMapping: FieldMapping = {
  from: 'name',
  to: 'name',
  required: true,
  serialize: v => `name: ${v as string}`,
};

const descriptionMapping: FieldMapping = {
  from: 'description',
  to: 'description',
  required: true,
  serialize: v => `description: ${yamlScalar(v as string)}`,
};

const whenToUseMapping: FieldMapping = {
  from: 'whenToUse',
  to: 'when_to_use',
  required: false,
  serialize: v => `when_to_use: ${yamlScalar(v as string)}`,
};

const allowedToolsMapping: FieldMapping = {
  from: 'allowedTools',
  to: 'allowed-tools',
  required: false,
  when: fm => Array.isArray(fm.allowedTools) && (fm.allowedTools as string[]).length > 0,
  serialize: v => `allowed-tools: ${(v as string[]).join(', ')}`,
};

const argumentHintMapping: FieldMapping = {
  from: 'argumentHint',
  to: 'argument-hint',
  required: false,
  serialize: v => `argument-hint: "${(v as string).replace(/"/g, '\\"')}"`,
};

const disableModelInvocationMapping: FieldMapping = {
  from: 'disableModelInvocation',
  to: 'disable-model-invocation',
  required: false,
  when: fm => fm.disableModelInvocation === true,
  serialize: () => `disable-model-invocation: true`,
};

const userInvocableMapping: FieldMapping = {
  from: 'userInvocable',
  to: 'user-invocable',
  required: false,
  when: fm => fm.userInvocable === false,
  serialize: () => `user-invocable: false`,
};

const skillContextMapping: FieldMapping = {
  from: 'skillContext',
  to: 'context',
  required: false,
  serialize: v => `context: ${v as string}`,
};

const SKILL_FRONTMATTER: readonly FieldMapping[] = [
  nameMapping,
  descriptionMapping,
  whenToUseMapping,
  allowedToolsMapping,
  argumentHintMapping,
  disableModelInvocationMapping,
  userInvocableMapping,
  skillContextMapping,
];

/** The "## Applied Rules" section — plugin-build variant only (see module header). */
const appliedRulesSection: BodySectionSpec = {
  id: 'appliedRules',
  position: 'after',
  render: (artifact: ResolvedArtifact) => {
    const rules = artifact.resolvedRules ?? [];
    if (rules.length === 0) return [];
    const parts: string[] = ['', '---', '', '## Applied Rules', ''];
    for (const rule of rules) {
      const ruleTitle = rule.frontmatter.title as string;
      parts.push(`### ${ruleTitle}`, '', rule.resolvedBody ?? rule.body, '');
    }
    return parts;
  },
};

function outputPath(
  artifact: ResolvedArtifact,
  packName: string | undefined,
  prefix: string,
): string {
  const name = artifact.frontmatter.name as string;
  return packName
    ? `plugins/${packName}/skills/${name}/SKILL.md`
    : `${prefix}/skills/${name}/SKILL.md`;
}

export const CLAUDE_PLUGIN_SKILL_SPEC: KindEmitSpec = {
  kind: 'skill',
  variant: 'plugin',
  outputPath: (artifact, ctx) => outputPath(artifact, ctx.packName, '.claude'),
  pathPattern: /plugins\/[^/]+\/skills\/.*\/SKILL\.md$/,
  frontmatter: SKILL_FRONTMATTER,
  emitEmptyFrontmatter: true, // name/description are always present
  body: [appliedRulesSection],
  forbiddenKeys: ['applyTo', 'paths', 'agent'],
  // NOT adding an unresolved-{{…}} bodyForbid here, unlike spec/prompt.ts and spec/workflow.ts:
  // real skills (Angular, in particular) legitimately contain literal {{ }} template-binding
  // syntax in prose/examples — see COPILOT_SKILL_SPEC's identical note in copilot/spec/skill.ts.
  // Since prompt/workflow render through this exact path and checkOutputContract() (routed by
  // path pattern) matches THIS contract first, their {{ check is not enforced post-render by
  // output-contract; it's covered instead by direct spec.bodyForbids assertions in
  // test/targets/claude-code.test.ts, and by bodyTransform running unconditionally at render time.
  bodyForbids: [
    {
      pattern: /\$\{input:/,
      reason: 'Copilot ${input:…} placeholder found in Claude SKILL.md body',
    },
  ],
  docs: [CLAUDE_SKILLS_DOC],
};

export const CLAUDE_SCAFFOLD_SKILL_SPEC: KindEmitSpec = {
  ...CLAUDE_PLUGIN_SKILL_SPEC,
  variant: 'scaffold',
  outputPath: (artifact, ctx) => outputPath(artifact, ctx.packName, '.claude'),
  pathPattern: /\.claude\/skills\/.*\/SKILL\.md$/,
  body: [], // rules are NOT inlined in the scaffold layout — .claude/rules/*.md loads natively
};
