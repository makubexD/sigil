/**
 * The OpenCode target's body lexicon (../lexicon.ts): the project conventions file is the root
 * `AGENTS.md`, which also carries repo-wide rules (there is no rules folder), and skills live in
 * `.agents/skills/`. A skill takes no invocation arguments under the Agent Skills format.
 *
 * @module
 */
import type { ProviderLexicon } from '../lexicon';
import { OPENCODE_RULES_DOC, OPENCODE_SKILLS_DOC } from './doc-refs';

export const OPENCODE_LEXICON: ProviderLexicon = {
  'conventions-file': { value: 'AGENTS.md', doc: OPENCODE_RULES_DOC },
  'rules-dir': { value: 'AGENTS.md', doc: OPENCODE_RULES_DOC },
  'skills-dir': { value: '.agents/skills/', doc: OPENCODE_SKILLS_DOC },
  arguments: { value: 'the request you were given', doc: OPENCODE_SKILLS_DOC },
};
