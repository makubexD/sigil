/**
 * Shared `bodyForbids` entries backing the lexicon (see ./lexicon.ts) — every KindEmitSpec adds
 * `UNTRANSLATED_TOKEN_FORBID`, and every Copilot spec additionally adds
 * `PROVIDER_TERM_LITERAL_FORBIDS` so a hardcoded Claude-ism (an author bypassing the lexicon
 * entirely, e.g. typing `CLAUDE.md` instead of `{sigil:conventions-file}`) fails the output
 * contract even though `applyLexicon` never sees it. This is the second net the original
 * `platform-path-leak` gap lacked — see docs/decisions/provider-neutral-body-lexicon-2026-08.md.
 */

/** A `{sigil:…}` token surviving to the rendered output means an unknown term (applyLexicon
 * throws before this point) or a spec that forgot to wire its lexicon — either way, a hard stop. */
export const UNTRANSLATED_TOKEN_FORBID = {
  pattern: /\{sigil:/,
  reason: 'untranslated {sigil:…} lexicon token reached rendered output',
};

/** Copilot-only: catches an author hardcoding a Claude-specific literal instead of the neutral
 * lexicon token. Not applied on the Claude side — these strings ARE Claude's own correct output. */
export const CLAUDE_LITERAL_FORBIDS_ON_COPILOT = [
  { pattern: /CLAUDE\.md/, reason: 'hardcoded CLAUDE.md in a body rendered for Copilot' },
  {
    pattern: /\$ARGUMENTS/,
    reason: 'hardcoded Claude $ARGUMENTS token in a body rendered for Copilot',
  },
];
