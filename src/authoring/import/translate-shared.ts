/**
 * Types and string helpers shared by translate.ts, translate-kinds.ts, and translate-helpers.ts.
 *
 * Split out to break a value-level circular import: translate.ts previously defined these and
 * translate-kinds.ts/translate-helpers.ts imported back from it while translate.ts imported the
 * per-kind translators from translate-kinds.ts — a real A→B→A cycle, fragile under CommonJS load
 * order (2026-08-22 audit F28). This is the one-directional leaf every other file in the cluster
 * imports from; nothing in here imports from translate.ts, translate-kinds.ts, or
 * translate-helpers.ts.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TranslateOptions {
  /** Target catalog language (e.g. "csharp", "typescript", "angular"). */
  language: string;
  /** Language display name for title generation (e.g. ".NET / C#", "TypeScript", "Angular"). */
  displayName: string;
  /** The language's artifact-name prefix from its language.yaml (`cs`, `ts`), stripped from titles. */
  prefix?: string | undefined;
}

export interface CatalogFrontmatter {
  id: string;
  kind: 'skill' | 'agent' | 'rule';
  title: string;
  description: string;
  /** Absent for a shared artifact. */
  language?: string | undefined;
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
export function stripLanguagePrefix(slug: string, prefix: string | undefined): string {
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
export function slugToTitle(slug: string, displayName: string, prefix?: string): string {
  const withoutPrefix = stripLanguagePrefix(slug, prefix);
  const words = withoutPrefix
    .split('-')
    .map(w => ACRONYM_MAP[w.toLowerCase()] ?? w.charAt(0).toUpperCase() + w.slice(1));
  return displayName ? `${words.join(' ')} (${displayName})` : words.join(' ');
}
