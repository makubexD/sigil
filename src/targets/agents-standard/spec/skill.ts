/**
 * Open-standard `skill` emission spec: `.agents/skills/<name>/SKILL.md` per the Agent Skills spec.
 * Frontmatter is the spec's own fields (`name`, `description`, and `allowed-tools` as the spec's
 * space-separated list); `whenToUse`, `argumentHint`, the Boundary and the skill's rules become
 * body sections, shared with Copilot (../../shared/skill-sections.ts).
 *
 * @module
 */
import type { KindEmitSpec } from '../../spec-types';
import { AGENT_SKILLS_SPEC_DOC, COPILOT_AGENT_SKILLS_DOC } from '../../doc-refs';
import { AGENT_SKILLS_LIMITS } from '../../agent-skills-limits';
import { UNTRANSLATED_TOKEN_FORBID } from '../../lexicon-forbid';
import {
  nameMapping,
  descriptionMapping,
  allowedToolsMapping,
  whenToUseSection,
  argumentHintSection,
  boundarySection,
  codingGuidelinesSection,
} from '../../shared/skill-sections';
import { AGENTS_STANDARD_LEXICON } from '../lexicon';
import { CURSOR_SKILLS_DOC } from '../doc-refs';

/** The Agent Skills spec's SKILL.md guidance: keep the body under 500 lines. */
const MAX_SKILL_BODY_LINES = 500;

export const AGENTS_STANDARD_SKILL_SPEC: KindEmitSpec = {
  kind: 'skill',
  outputPath: artifact => `.agents/skills/${artifact.frontmatter.name as string}/SKILL.md`,
  pathPattern: /\.agents\/skills\/.*\/SKILL\.md$/,
  frontmatter: [nameMapping, descriptionMapping, allowedToolsMapping],
  emitEmptyFrontmatter: true,
  body: [boundarySection, whenToUseSection, argumentHintSection, codingGuidelinesSection],
  forbiddenKeys: ['applyTo', 'paths', 'agent', 'argument-hint'],
  lexicon: AGENTS_STANDARD_LEXICON,
  bodyForbids: [UNTRANSLATED_TOKEN_FORBID],
  docs: [AGENT_SKILLS_SPEC_DOC, COPILOT_AGENT_SKILLS_DOC, CURSOR_SKILLS_DOC],
  limits: [
    ...AGENT_SKILLS_LIMITS,
    {
      field: 'body',
      max: MAX_SKILL_BODY_LINES,
      unit: 'lines',
      severity: 'warning',
      doc: AGENT_SKILLS_SPEC_DOC,
    },
  ],
};
