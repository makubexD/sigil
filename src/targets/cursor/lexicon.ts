/**
 * The Cursor target's body lexicon (../lexicon.ts): the conventions file is the root `AGENTS.md`
 * (Cursor reads it), project rules live in `.cursor/rules/`, and skills in `.cursor/skills/`. A
 * skill takes no invocation arguments under the Agent Skills format.
 *
 * @module
 */
import type { ProviderLexicon } from '../lexicon';
import { CURSOR_RULES_DOC, CURSOR_SKILLS_DOC } from './doc-refs';

export const CURSOR_LEXICON: ProviderLexicon = {
  'conventions-file': { value: 'AGENTS.md', doc: CURSOR_RULES_DOC },
  'rules-dir': { value: '.cursor/rules/', doc: CURSOR_RULES_DOC },
  'skills-dir': { value: '.cursor/skills/', doc: CURSOR_SKILLS_DOC },
  arguments: { value: 'the request you were given', doc: CURSOR_SKILLS_DOC },
};
