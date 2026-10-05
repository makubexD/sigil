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
 * create-skills page shows (`allowed-tools: shell`); Claude Code keeps its list, which its own docs
 * accept.
 */
import type { KindEmitSpec } from '../../spec-types';
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
  allowedToolsMapping,
  whenToUseSection,
  argumentHintSection,
  boundarySection,
  codingGuidelinesSection,
} from '../../shared/skill-sections';

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
