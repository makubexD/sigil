/**
 * The Codex target's body lexicon (../lexicon.ts): the project conventions file is the root
 * `AGENTS.md`, which also carries repo-wide rules (there is no rules folder), and skills live in
 * `.agents/skills/`. A skill takes no invocation arguments under the Agent Skills format. Values
 * match the agents-standard target's, so the two render byte-identical skills.
 *
 * @module
 */
import type { ProviderLexicon } from '../lexicon';
import { CODEX_AGENTS_MD_DOC, CODEX_SKILLS_DOC } from './doc-refs';

export const CODEX_LEXICON: ProviderLexicon = {
  'conventions-file': { value: 'AGENTS.md', doc: CODEX_AGENTS_MD_DOC },
  'rules-dir': { value: 'AGENTS.md', doc: CODEX_AGENTS_MD_DOC },
  'skills-dir': { value: '.agents/skills/', doc: CODEX_SKILLS_DOC },
  arguments: { value: 'the request you were given', doc: CODEX_SKILLS_DOC },
};
