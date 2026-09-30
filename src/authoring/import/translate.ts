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
 * translate-helpers.ts — both split out to keep this file under the module-size threshold.
 */
import { translateRule, translateAgent, translateSkill } from './translate-kinds';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TranslateOptions {
  /** Target catalog language (e.g. "csharp", "typescript", "angular"). */
  language: string;
  /** Language display name for title generation (e.g. ".NET / C#", "TypeScript", "Angular"). */
  displayName: string;
}

export interface CatalogFrontmatter {
  id: string;
  kind: 'skill' | 'agent' | 'rule';
  title: string;
  description: string;
  language: string;
  tags: string[];
  // rule-specific
  appliesTo?: string[] | undefined;
  severity?: 'required' | 'recommended' | 'optional' | undefined;
  extends?: string[] | undefined;
  // agent-specific
  name?: string | undefined;
  tools?: string[] | undefined;
  // skill-specific
  uses?: { rules: string[]; agents: string[] } | undefined;
  whenToUse?: string | undefined;
  allowedTools?: string[] | undefined;
  argumentHint?: string | undefined;
  disableModelInvocation?: boolean | undefined;
}

export interface TranslateResult {
  frontmatter: CatalogFrontmatter;
  /** Source frontmatter fields that have no mapping and were dropped. */
  droppedFields: string[];
  /**
   * Optional text to prepend to the source body before rendering.
   * Used for source fields (e.g. when_to_use) that belong in the body, not the YAML header.
   */
  bodyPrefix?: string | undefined;
  /**
   * True when the description was absent from the source and a generic fallback was synthesized.
   * Surfaced as a warning in the coverage report to prompt content-refinement.
   */
  descriptionSynthesized?: boolean | undefined;
}

// ─── Slug to Title ────────────────────────────────────────────────────────────

/**
 * Canonical prefix per catalog language key.
 * Used by stripLanguagePrefix to detect and remove the language-specific kebab prefix.
 * When a new language is added its canonical prefix should be registered here.
 */
const LANGUAGE_PREFIXES: Record<string, string> = {
  csharp: 'cs',
  typescript: 'ts',
  angular: 'ng',
  python: 'py',
  react: 'react',
};

/**
 * Acronym/casing overrides for common technical terms produced by slug-splitting.
 * Prevents slugToTitle from lowercasing well-known initialisms.
 */
const ACRONYM_MAP: Record<string, string> = {
  rxjs: 'RxJS',
  api: 'API',
  http: 'HTTP',
  https: 'HTTPS',
  cli: 'CLI',
  sql: 'SQL',
  ui: 'UI',
  ux: 'UX',
  nuget: 'NuGet',
  sdk: 'SDK',
  orm: 'ORM',
};

/**
 * Strip the canonical language prefix from a slug, if present.
 *
 * Examples:
 *   cs-generate-tests, csharp → generate-tests
 *   ng-rxjs,           angular → rxjs
 *   py-linting,        python  → linting
 *   something,         csharp  → something  (no prefix — returned as-is, with a warning)
 */
export function stripLanguagePrefix(slug: string, language: string): string {
  const prefix = LANGUAGE_PREFIXES[language];
  if (prefix && slug.startsWith(`${prefix}-`)) {
    return slug.slice(prefix.length + 1);
  }
  return slug;
}

/**
 * Convert a prefixed kebab-case slug to a human-readable title.
 *
 * Rules:
 *   - Strip the canonical language prefix via stripLanguagePrefix.
 *   - Apply ACRONYM_MAP overrides before Title-Casing.
 *   - Append the language displayName in parentheses for disambiguation.
 *
 * Examples:
 *   cs-generate-tests, csharp, ".NET / C#"  → "Generate Tests (.NET / C#)"
 *   ng-rxjs,           angular, "Angular"   → "RxJS (Angular)"
 *   ts-audit-deps,     typescript, "TypeScript" → "Audit Deps (TypeScript)"
 */
export function slugToTitle(slug: string, displayName: string, language?: string): string {
  const withoutPrefix = language
    ? stripLanguagePrefix(slug, language)
    : slug.replace(/^(cs|ng|ts|py)-/, '');
  const words = withoutPrefix
    .split('-')
    .map(w => ACRONYM_MAP[w.toLowerCase()] ?? w.charAt(0).toUpperCase() + w.slice(1));
  return `${words.join(' ')} (${displayName})`;
}

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
  switch (kind) {
    case 'rule':
      return translateRule(slug, sourceFm, opts);
    case 'agent':
      return translateAgent(slug, sourceFm, opts);
    case 'skill':
      return translateSkill(slug, sourceFm, opts);
  }
}
