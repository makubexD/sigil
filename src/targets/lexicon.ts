/**
 * Provider body lexicon — the translation layer the frontmatter side already had
 * (FieldMapping) but the body side did not. Catalog authors write neutral
 * `{sigil:<term>}` tokens in prose; each provider's KindEmitSpec.lexicon supplies the
 * literal text substituted at render time (src/targets/emit.ts's renderArtifact).
 *
 * Why this exists: an artifact's body used to pass through every spec verbatim except
 * for the `{{name}}` → provider-arg translation on prompt/workflow. Any other
 * provider-specific string an author typed (`CLAUDE.md`, `$ARGUMENTS`) shipped
 * unchanged to every provider — see docs/decisions/provider-neutral-body-lexicon-2026-08.md
 * for the audit that found this (a Copilot-targeted `ng-security-auditor.agent.md`
 * telling Copilot to "Read CLAUDE.md").
 *
 * LEXICON_TERMS is the single list of neutral terms — every ProviderLexicon must supply
 * exactly these keys (enforced by the type), and the `provider-term-leak` conformance
 * rule (src/commands/sync/conformance/rules/provider-term-leak.ts) derives its detection
 * patterns from every registered lexicon's values, so a new term is guarded automatically.
 */
import type { DocRef } from './spec-types';

/**
 * Add a term here only when at least two providers need genuinely different text for the
 * same concept — a term with identical values across all providers belongs in prose, not
 * the lexicon (no translation is happening). Keep this list minimal; it is not a general
 * templating mechanism.
 *
 * Deliberately does NOT include a "product" term ("Claude Code" / "GitHub Copilot") — several
 * catalog artifacts (mcp notes, the author-artifact prompt) legitimately name both products
 * side-by-side as documentation ABOUT sigil's own multi-provider behavior, not a per-provider
 * instruction. That prose is correct verbatim on every provider; there is nothing to translate.
 */
export const LEXICON_TERMS = ['conventions-file', 'rules-dir', 'arguments'] as const;

export type LexiconTerm = (typeof LEXICON_TERMS)[number];

export interface LexiconEntry {
  /** The literal text substituted for `{sigil:<term>}` on this provider. */
  readonly value: string;
  /** Official documentation backing this value — re-verified the same way spec `docs:` are. */
  readonly doc: DocRef;
}

export type ProviderLexicon = Readonly<Record<LexiconTerm, LexiconEntry>>;

const TOKEN_RE = /\{sigil:([\w-]+)\}/g;

/**
 * Substitutes every `{sigil:<term>}` token in `body` with its provider-specific value.
 * An unrecognized term throws — a typo in catalog source fails the build instead of
 * shipping a literal, unresolved token to a provider (guarded further by the
 * `bodyForbids: [{ pattern: /\{sigil:/ }]` entry every spec carries as a second net).
 */
export function applyLexicon(body: string, lexicon: ProviderLexicon): string {
  return body.replace(TOKEN_RE, (match, term: string) => {
    const entry = (lexicon as Record<string, LexiconEntry | undefined>)[term];
    if (!entry) {
      throw new Error(
        `Unknown lexicon term '${term}' in body (${match}). Valid terms: ${LEXICON_TERMS.join(', ')}`,
      );
    }
    return entry.value;
  });
}
