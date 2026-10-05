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
 */
import type { KindEmitSpec, FieldMapping } from '../../spec-types';
import { yamlList } from '../../yaml-util';
import {
  COPILOT_AGENT_SKILLS_DOC,
  VSCODE_AGENT_SKILLS_DOC,
  AGENT_SKILLS_SPEC_DOC,
} from '../../doc-refs';
import { COPILOT_LEXICON } from '../lexicon';
import { UNTRANSLATED_TOKEN_FORBID } from '../../lexicon-forbid';
import { AGENT_SKILLS_LIMITS } from '../../agent-skills-limits';
import {
  nameMapping,
  descriptionMapping,
  whenToUseSection,
  argumentHintSection,
  boundarySection,
  codingGuidelinesSection,
} from '../../shared/skill-sections';

/**
 * Vendor-neutral `allowedTools` (schema/index.ts's SkillSchema), same source field
 * claude-code/spec/skill.ts's `allowedToolsMapping` consumes. Valid on Copilot per
 * AGENT_SKILLS_SPEC_DOC's six-field outside-Claude-Code spec. Previously dropped entirely — a
 * skill declaring 4 read-only tools got Copilot's unrestricted default, the same bug class as the
 * agent `tools` gap fixed 2026-08-10 (see declared-but-unemitted conformance rule).
 */
const allowedToolsMapping: FieldMapping = {
  from: 'allowedTools',
  to: 'allowed-tools',
  required: false,
  when: fm => Array.isArray(fm.allowedTools) && (fm.allowedTools as string[]).length > 0,
  serialize: v => `allowed-tools: ${yamlList(v as string[])}`,
};

export const COPILOT_SKILL_SPEC: KindEmitSpec = {
  kind: 'skill',
  // Same layout for compile and scaffold: Copilot has no plugin channel.
  outputPath: artifact => `.github/skills/${artifact.frontmatter.name as string}/SKILL.md`,
  pathPattern: /\.github\/skills\/.*\/SKILL\.md$/,
  frontmatter: [nameMapping, descriptionMapping, allowedToolsMapping],
  emitEmptyFrontmatter: true,
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
