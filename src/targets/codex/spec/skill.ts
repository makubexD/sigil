/**
 * Codex `skill` emission spec: `.agents/skills/<name>/SKILL.md`, the open-standard layout Codex
 * loads. Frontmatter, body, forbidden keys and limits match the agents-standard spec, except that
 * `allowed-tools` is left out: Codex documents no such field, and a missing pre-approval only adds
 * permission prompts (Decision 6, docs/decisions/neutral-agent-vocabulary-2026-11.md).
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
  whenToUseSection,
  argumentHintSection,
  boundarySection,
  codingGuidelinesSection,
} from '../../shared/skill-sections';
import { CODEX_LEXICON } from '../lexicon';
import { CODEX_SKILLS_DOC } from '../doc-refs';

/** The Agent Skills spec's SKILL.md guidance: keep the body under 500 lines. */
const MAX_SKILL_BODY_LINES = 500;

export const CODEX_SKILL_SPEC: KindEmitSpec = {
  kind: 'skill',
  outputPath: artifact => `.agents/skills/${artifact.frontmatter.name as string}/SKILL.md`,
  pathPattern: /\.agents\/skills\/.*\/SKILL\.md$/,
  frontmatter: [nameMapping, descriptionMapping],
  emitEmptyFrontmatter: true,
  body: [boundarySection, whenToUseSection, argumentHintSection, codingGuidelinesSection],
  forbiddenKeys: ['applyTo', 'paths', 'agent', 'argument-hint'],
  lexicon: CODEX_LEXICON,
  bodyForbids: [UNTRANSLATED_TOKEN_FORBID],
  docs: [CODEX_SKILLS_DOC],
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
