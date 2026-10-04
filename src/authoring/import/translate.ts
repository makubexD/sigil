/**
 * Translate source Claude template frontmatter into catalog frontmatter.
 *
 * This module is PURE (no I/O, no side effects) so it is fully unit-testable.
 *
 * Source frontmatter conventions (per kind):
 *
 *   rule   → description, paths? (YAML list)
 *   agent  → name, description, tools (comma string)
 *   skill  → allowed-tools (comma string), argument-hint?, description, when_to_use?,
 *             disable-model-invocation? (bool)
 *
 * Catalog frontmatter output (per kind):
 *
 *   rule   → id, kind, title, description, language, appliesTo (←paths, default ['**\/*']),
 *             severity: recommended, extends: [], tags
 *   agent  → id, kind, name (kept incl. prefix), title, description, language,
 *             tools[] (←split comma string), tags
 *   skill  → id, kind, name (= slug), title, description (source description only — single-line),
 *             language, whenToUse (←when_to_use), allowedTools[] (←allowed-tools),
 *             argumentHint (←argument-hint), disableModelInvocation (←flag),
 *             uses: { rules: [], agents: [] }, tags
 *
 * Per-kind translators live in translate-kinds.ts; low-level string helpers live in
 * translate-helpers.ts; shared types + slug/title helpers live in translate-shared.ts — all
 * split out to keep this file under the module-size threshold and to avoid a circular import
 * (see translate-shared.ts's header).
 */
import { translateRule, translateAgent, translateSkill } from './translate-kinds';
import { SHARED_NAMESPACE } from '../../catalog-layout';

export {
  stripLanguagePrefix,
  slugToTitle,
  type TranslateOptions,
  type CatalogFrontmatter,
  type TranslateResult,
} from './translate-shared';
import type { TranslateOptions, TranslateResult } from './translate-shared';

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Translate a discovered artifact's source frontmatter into catalog frontmatter.
 *
 * @param kind      Detected kind ('skill' | 'agent' | 'rule')
 * @param slug      Source slug (folder name for skills, file stem for others)
 * @param sourceFm  Raw frontmatter from the source file
 * @param opts      Language and display-name context
 */
export function translateFrontmatter(
  kind: 'skill' | 'agent' | 'rule',
  slug: string,
  sourceFm: Record<string, unknown>,
  opts: TranslateOptions,
): TranslateResult {
  const result = translateByKind(kind, slug, sourceFm, opts);
  if (opts.language !== SHARED_NAMESPACE) return result;
  const { language: _dropped, ...frontmatter } = result.frontmatter;
  return { ...result, frontmatter };
}

/** Dispatches to the per-kind translator. */
function translateByKind(
  kind: 'skill' | 'agent' | 'rule',
  slug: string,
  sourceFm: Record<string, unknown>,
  opts: TranslateOptions,
): TranslateResult {
  switch (kind) {
    case 'rule':
      return translateRule(slug, sourceFm, opts);
    case 'agent':
      return translateAgent(slug, sourceFm, opts);
    case 'skill':
      return translateSkill(slug, sourceFm, opts);
  }
}
