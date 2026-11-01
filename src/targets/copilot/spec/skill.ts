/**
 * Copilot `skill` emission spec.
 * Frontmatter is deliberately minimal: `name` + `description` only. NO `applyTo`/`paths` —
 * Copilot Agent Skills load by description relevance, not file-path matching. Resolved rule
 * bodies are always inlined (Copilot has no equivalent to Claude's native .claude/rules/ loading
 * on the scaffold path, so both compile and scaffold outputs inline for self-containment).
 *
 * `whenToUse` has no Copilot frontmatter equivalent (Claude emits it natively as `when_to_use:`
 * — see claude-code/spec/skill.ts). Copilot Agent Skills dispatch on `description` relevance
 * alone, so the field is rendered as a leading `## When to Use` body section instead of being
 * dropped — see whenToUseSection below. (Fixed 2026-08-07: the field was previously silently
 * absent from both Copilot frontmatter and body for any artifact authoring it.)
 *
 * `allowed-tools` uses the Agent Skills spec's space-separated string, the form GitHub's
 * create-skills page shows (`allowed-tools: shell`), and renders the neutral vocabulary through
 * COPILOT_SKILL_TOOL_DIALECT. Copilot has no skill-side `agent` or `todo` pre-approval, so a list
 * that only carries those renders empty and emits no line.
 */
import type { FieldMapping, KindEmitSpec } from '../../spec-types';
import {
  COPILOT_AGENT_SKILLS_DOC,
  VSCODE_AGENT_SKILLS_DOC,
  AGENT_SKILLS_SPEC_DOC,
} from '../../doc-refs';
import { yamlScalar } from '../../yaml-util';
import { COPILOT_LEXICON } from '../lexicon';
import { UNTRANSLATED_TOKEN_FORBID } from '../../lexicon-forbid';
import { AGENT_SKILLS_LIMITS } from '../../agent-skills-limits';
import { COPILOT_SKILL_TOOL_DIALECT, copilotSkillToolNames } from '../tool-dialect';
import {
  nameMapping,
  descriptionMapping,
  whenToUseSection,
  argumentHintSection,
  boundarySection,
  codingGuidelinesSection,
} from '../../shared/skill-sections';

/**
 * `allowed-tools` in the Agent Skills spec's form: one space-separated string, quoted, rendered
 * through the Copilot skill dialect. The field pre-approves tools; it doesn't restrict them. A tool
 * name with whitespace can't be carried (it would split into other names), so rendering refuses it
 * rather than pre-approve the wrong tools or drop the field.
 */
const allowedToolsMapping: FieldMapping = {
  from: 'allowedTools',
  to: 'allowed-tools',
  required: false,
  when: fm =>
    Array.isArray(fm.allowedTools) && copilotSkillToolNames(fm.allowedTools as string[]).length > 0,
  serialize: v => {
    const tools = copilotSkillToolNames(v as string[]);
    const spaced = tools.filter(tool => /\s/.test(tool));
    if (spaced.length > 0) {
      throw new Error(
        `allowed-tools ${spaced.map(t => `"${t}"`).join(', ')} contain whitespace, ` +
          "which the Agent Skills spec's space-separated list cannot carry",
      );
    }
    return `allowed-tools: ${yamlScalar(tools.join(' '))}`;
  },
};

export const COPILOT_SKILL_SPEC: KindEmitSpec = {
  kind: 'skill',
  // Same layout for compile and scaffold: sigil emits no Copilot plugin.
  outputPath: artifact => `.github/skills/${artifact.frontmatter.name as string}/SKILL.md`,
  pathPattern: /\.github\/skills\/.*\/SKILL\.md$/,
  frontmatter: [nameMapping, descriptionMapping, allowedToolsMapping],
  emitEmptyFrontmatter: true,
  toolDialect: COPILOT_SKILL_TOOL_DIALECT,
  body: [boundarySection, whenToUseSection, argumentHintSection, codingGuidelinesSection],
  forbiddenKeys: ['applyTo', 'paths', 'agent', 'argument-hint'],
  lexicon: COPILOT_LEXICON,
  // No {{ forbid — skill bodies never go through placeholder translation (that's a
  // prompt/workflow-only concept), and Angular skills legitimately contain literal `{{ }}`
  // template-binding syntax in their prose/examples.
  bodyForbids: [UNTRANSLATED_TOKEN_FORBID],
  // Both consumers of .github/skills/*/SKILL.md — GitHub's cloud agent and VS Code's local agent
  // read the same shared Agent Skills open standard, each with its own docs page.
  docs: [COPILOT_AGENT_SKILLS_DOC, VSCODE_AGENT_SKILLS_DOC, AGENT_SKILLS_SPEC_DOC],
  // VS Code: a skill whose name breaks the spec silently fails to load.
  limits: AGENT_SKILLS_LIMITS,
};
