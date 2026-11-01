/**
 * Cursor `skill` emission spec: `.cursor/skills/<name>/SKILL.md`, the folder Cursor loads
 * project skills from. Frontmatter, body, forbidden keys and limits match the agents-standard spec,
 * with the Codex spec's body sections (so a skill's rules are inlined into it).
 *
 * @module
 */
import type { KindEmitSpec } from '../../spec-types';
import { AGENT_SKILLS_SPEC_DOC } from '../../doc-refs';
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
import { CURSOR_LEXICON } from '../lexicon';
import { CURSOR_SKILLS_DOC } from '../doc-refs';

/** The Agent Skills spec's SKILL.md guidance: keep the body under 500 lines. */
const MAX_SKILL_BODY_LINES = 500;

export const CURSOR_SKILL_SPEC: KindEmitSpec = {
  kind: 'skill',
  outputPath: artifact => `.cursor/skills/${artifact.frontmatter.name as string}/SKILL.md`,
  pathPattern: /\.cursor\/skills\/.*\/SKILL\.md$/,
  frontmatter: [nameMapping, descriptionMapping, allowedToolsMapping],
  emitEmptyFrontmatter: true,
  body: [boundarySection, whenToUseSection, argumentHintSection, codingGuidelinesSection],
  forbiddenKeys: ['applyTo', 'paths', 'agent', 'argument-hint'],
  lexicon: CURSOR_LEXICON,
  bodyForbids: [UNTRANSLATED_TOKEN_FORBID],
  docs: [CURSOR_SKILLS_DOC],
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
