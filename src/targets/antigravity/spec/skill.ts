/**
 * Antigravity `skill` emission spec: the open-standard skill file
 * (../../agents-standard/spec/skill.ts) with Antigravity's lexicon and citation, in a scaffold
 * and a plugin variant. Frontmatter, tool dialect, body sections, forbidden keys and limits are
 * shared; only the path differs — `.agents/skills/<name>/SKILL.md` in a consumer project, and
 * `plugins/<pack>/skills/<name>/SKILL.md` in a built plugin.
 *
 * @module
 */
import type { KindEmitSpec } from '../../spec-types';
import { SigilError } from '../../../errors';
import { AGENTS_STANDARD_SKILL_SPEC } from '../../agents-standard/spec/skill';
import { ANTIGRAVITY_LEXICON } from '../lexicon';
import { ANTIGRAVITY_SKILLS_DOC } from '../doc-refs';

export const ANTIGRAVITY_SKILL_SPEC: KindEmitSpec = {
  ...AGENTS_STANDARD_SKILL_SPEC,
  variant: 'scaffold',
  lexicon: ANTIGRAVITY_LEXICON,
  docs: [ANTIGRAVITY_SKILLS_DOC],
};

/** The plugin variant: the same skill file under its pack's `skills/` folder. */
export const ANTIGRAVITY_PLUGIN_SKILL_SPEC: KindEmitSpec = {
  ...ANTIGRAVITY_SKILL_SPEC,
  variant: 'plugin',
  outputPath: (artifact, ctx) => {
    if (ctx.packName === undefined) {
      throw new SigilError('the Antigravity plugin variant needs a pack name');
    }
    return `plugins/${ctx.packName}/skills/${artifact.frontmatter.name as string}/SKILL.md`;
  },
  pathPattern: /plugins\/[^/]+\/skills\/.*\/SKILL\.md$/,
};
