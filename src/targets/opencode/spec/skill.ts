/**
 * OpenCode `skill` emission spec: `.agents/skills/<name>/SKILL.md`, the same open-standard layout
 * Codex writes. Frontmatter, body, forbidden keys and limits are identical to `CODEX_SKILL_SPEC`,
 * and only the lexicon and citation differ: OpenCode reads `.agents/skills/` and documents the
 * Agent Skills format in its own page.
 *
 * The path is not `.opencode/skills/`, even though OpenCode treats that folder as native. OpenCode
 * loads a skill name from more than one folder by keeping the later write, and `add` parses with
 * unbounded concurrency, so two copies of one name race and the winner is completion order, not
 * folder order (D2, docs/decisions/opencode-target-2026-11.md). Writing only the shared folder
 * keeps one copy on disk.
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
import { OPENCODE_LEXICON } from '../lexicon';
import { OPENCODE_SKILLS_DOC } from '../doc-refs';

/** The Agent Skills spec's SKILL.md guidance: keep the body under 500 lines. */
const MAX_SKILL_BODY_LINES = 500;

export const OPENCODE_SKILL_SPEC: KindEmitSpec = {
  kind: 'skill',
  outputPath: artifact => `.agents/skills/${artifact.frontmatter.name as string}/SKILL.md`,
  pathPattern: /\.agents\/skills\/.*\/SKILL\.md$/,
  frontmatter: [nameMapping, descriptionMapping],
  emitEmptyFrontmatter: true,
  body: [boundarySection, whenToUseSection, argumentHintSection, codingGuidelinesSection],
  forbiddenKeys: ['applyTo', 'paths', 'agent', 'argument-hint'],
  lexicon: OPENCODE_LEXICON,
  bodyForbids: [UNTRANSLATED_TOKEN_FORBID],
  docs: [OPENCODE_SKILLS_DOC],
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
