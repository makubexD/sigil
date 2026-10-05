/**
 * The open-standard target's body lexicon (../lexicon.ts): the project conventions file is the
 * root `AGENTS.md`, which also carries repo-wide rules (there is no rules folder), and skills live
 * in `.agents/skills/`. A skill takes no invocation arguments under the Agent Skills spec.
 *
 * @module
 */
import type { ProviderLexicon } from '../lexicon';
import { AGENT_SKILLS_SPEC_DOC, AGENTS_MD_STANDARD_DOC } from '../doc-refs';
import { CURSOR_SKILLS_DOC } from './doc-refs';

export const AGENTS_STANDARD_LEXICON: ProviderLexicon = {
  'conventions-file': { value: 'AGENTS.md', doc: AGENTS_MD_STANDARD_DOC },
  'rules-dir': { value: 'AGENTS.md', doc: AGENTS_MD_STANDARD_DOC },
  'skills-dir': { value: '.agents/skills/', doc: CURSOR_SKILLS_DOC },
  arguments: { value: 'the request you were given', doc: AGENT_SKILLS_SPEC_DOC },
};
