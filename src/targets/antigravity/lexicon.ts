/**
 * The Antigravity target's body lexicon (../lexicon.ts): the conventions file is the root
 * `AGENTS.md`, project rules live in `.agents/rules/`, and skills in `.agents/skills/`. A skill
 * takes no invocation arguments under the Agent Skills format.
 *
 * @module
 */
import type { ProviderLexicon } from '../lexicon';
import { ANTIGRAVITY_RULES_DOC, ANTIGRAVITY_SKILLS_DOC } from './doc-refs';

export const ANTIGRAVITY_LEXICON: ProviderLexicon = {
  'conventions-file': { value: 'AGENTS.md', doc: ANTIGRAVITY_RULES_DOC },
  'rules-dir': { value: '.agents/rules/', doc: ANTIGRAVITY_RULES_DOC },
  'skills-dir': { value: '.agents/skills/', doc: ANTIGRAVITY_SKILLS_DOC },
  arguments: { value: 'the request you were given', doc: ANTIGRAVITY_SKILLS_DOC },
};
