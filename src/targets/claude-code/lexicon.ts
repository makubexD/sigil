/**
 * Claude Code's body-lexicon values — see ../lexicon.ts for what this is and why. Every
 * KindEmitSpec in ./spec/ shares this one table (imported directly, not re-declared per spec).
 */
import type { ProviderLexicon } from '../lexicon';
import { CLAUDE_DIRECTORY_DOC, CLAUDE_RULES_DOC, CLAUDE_SKILLS_DOC } from '../doc-refs';

export const CLAUDE_LEXICON: ProviderLexicon = {
  'conventions-file': { value: 'CLAUDE.md', doc: CLAUDE_DIRECTORY_DOC },
  'rules-dir': { value: '.claude/rules/', doc: CLAUDE_RULES_DOC },
  arguments: { value: '$ARGUMENTS', doc: CLAUDE_SKILLS_DOC },
};
