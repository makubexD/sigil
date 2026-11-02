/**
 * Antigravity `skill` emission spec: the open-standard `.agents/skills/<name>/SKILL.md` spec
 * (../../agents-standard/spec/skill.ts) with Antigravity's lexicon and citation. Path,
 * frontmatter, tool dialect, body sections, forbidden keys and limits are shared, so the two
 * targets write the same file for the same skill.
 *
 * @module
 */
import type { KindEmitSpec } from '../../spec-types';
import { AGENTS_STANDARD_SKILL_SPEC } from '../../agents-standard/spec/skill';
import { ANTIGRAVITY_LEXICON } from '../lexicon';
import { ANTIGRAVITY_SKILLS_DOC } from '../doc-refs';

export const ANTIGRAVITY_SKILL_SPEC: KindEmitSpec = {
  ...AGENTS_STANDARD_SKILL_SPEC,
  lexicon: ANTIGRAVITY_LEXICON,
  docs: [ANTIGRAVITY_SKILLS_DOC],
};
