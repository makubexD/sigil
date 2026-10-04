/**
 * The `bodyForbids` entry every KindEmitSpec carries for the lexicon (see ./lexicon.ts). Literals
 * one provider must never receive from another (`CLAUDE.md` on Copilot) are not listed here: they
 * come from each lexicon's `forbidElsewhere` flag and are added to every other provider's output
 * contract by foreignLiteralForbids (./all-emit-specs.ts). See
 * docs/decisions/provider-neutral-body-lexicon-2026-08.md.
 */

/** A `{sigil:…}` token surviving to the rendered output means an unknown term (applyLexicon
 * throws before this point) or a spec that forgot to wire its lexicon — either way, a hard stop. */
export const UNTRANSLATED_TOKEN_FORBID = {
  pattern: /\{sigil:/,
  reason: 'untranslated {sigil:…} lexicon token reached rendered output',
};
