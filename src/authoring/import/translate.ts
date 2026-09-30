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
 *             language, appliesTo: ['**\/*'], allowedTools[] (←allowed-tools),
 *             argumentHint (←argument-hint), disableModelInvocation (←flag),
 *             uses: { rules: [], agents: [] }, tags;
 *             when_to_use prepended to body as '## When to Use' section (bodyPrefix)
 */

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

// ─── Translation helpers ──────────────────────────────────────────────────────

/**
 * Split a comma-string tools field into a string array.
 * Handles both "Read, Grep, Glob, Bash" and "Read,Grep" formats.
 */
function splitToolsString(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Derive tags from the slug (strip canonical language prefix, split on hyphen, add language tag).
 *
 * cs-generate-tests, language=csharp → ['csharp', 'generate', 'tests']
 */
function tagsFromSlug(slug: string, language: string): string[] {
  const withoutPrefix = stripLanguagePrefix(slug, language);
  const words = withoutPrefix.split('-').filter(Boolean);
  return [language, ...words];
}

// ─── Per-kind translators ─────────────────────────────────────────────────────

function translateRule(
  slug: string,
  sourceFm: Record<string, unknown>,
  opts: TranslateOptions,
): TranslateResult {
  const { language, displayName } = opts;
  const id = `${language}/${slug}`;
  const droppedFields: string[] = [];

  // description is the main content field — required
  const description = typeof sourceFm.description === 'string' ? sourceFm.description : '';

  // paths → appliesTo
  const appliesTo = Array.isArray(sourceFm.paths) ? (sourceFm.paths as string[]) : ['**/*'];

  // Track dropped fields
  const knownFields = new Set(['description', 'paths']);
  for (const key of Object.keys(sourceFm)) {
    if (!knownFields.has(key)) droppedFields.push(key);
  }

  const syntheticDescription = `${displayName} coding conventions and style guidelines.`;
  const frontmatter: CatalogFrontmatter = {
    id,
    kind: 'rule',
    title: slugToTitle(slug, displayName, language),
    description: description || syntheticDescription,
    language,
    appliesTo,
    severity: 'recommended',
    extends: [],
    tags: tagsFromSlug(slug, language),
  };

  return { frontmatter, droppedFields, descriptionSynthesized: !description };
}

function translateAgent(
  slug: string,
  sourceFm: Record<string, unknown>,
  opts: TranslateOptions,
): TranslateResult {
  const { language, displayName } = opts;
  const id = `${language}/${slug}`;
  const droppedFields: string[] = [];

  // name comes from frontmatter (same as slug in practice)
  const name = typeof sourceFm.name === 'string' ? sourceFm.name : slug;
  const description = typeof sourceFm.description === 'string' ? sourceFm.description : '';
  const tools = splitToolsString(sourceFm.tools);

  // Track dropped fields
  const knownFields = new Set(['name', 'description', 'tools']);
  for (const key of Object.keys(sourceFm)) {
    if (!knownFields.has(key)) droppedFields.push(key);
  }

  const syntheticDescription = `${displayName} specialist agent.`;
  const frontmatter: CatalogFrontmatter = {
    id,
    kind: 'agent',
    name,
    title: slugToTitle(slug, displayName, language),
    description: description || syntheticDescription,
    language,
    tools: tools.length > 0 ? tools : undefined,
    tags: tagsFromSlug(slug, language),
  };

  return { frontmatter, droppedFields, descriptionSynthesized: !description };
}

function translateSkill(
  slug: string,
  sourceFm: Record<string, unknown>,
  opts: TranslateOptions,
): TranslateResult {
  const { language, displayName } = opts;
  const id = `${language}/${slug}`;
  const droppedFields: string[] = [];

  const sourceDescription = typeof sourceFm.description === 'string' ? sourceFm.description : '';
  const whenToUse =
    typeof sourceFm['when_to_use'] === 'string' ? sourceFm['when_to_use'].trim() : '';

  // description stays single-line for the YAML header (multi-line strings break YAML serialization).
  // when_to_use is prepended to the body as a ## When to Use section instead.
  const descriptionSynthesized = !sourceDescription;
  const description = sourceDescription || `${displayName} skill.`;
  // Body prefix: only set when there is actual when_to_use content.
  const bodyPrefix = whenToUse ? `## When to Use\n\n${whenToUse}\n\n---\n\n` : undefined;

  // allowed-tools (hyphenated source key)
  const allowedToolsRaw = sourceFm['allowed-tools'];
  const allowedTools =
    typeof allowedToolsRaw === 'string'
      ? splitToolsString(allowedToolsRaw)
      : Array.isArray(allowedToolsRaw)
        ? (allowedToolsRaw as string[])
        : undefined;

  // argument-hint (hyphenated source key)
  const argumentHint =
    typeof sourceFm['argument-hint'] === 'string' ? sourceFm['argument-hint'] : undefined;

  // disable-model-invocation (hyphenated source key)
  const disableModelInvocation = sourceFm['disable-model-invocation'] === true ? true : undefined;

  // Track dropped fields
  const knownFields = new Set([
    'description',
    'when_to_use',
    'allowed-tools',
    'argument-hint',
    'disable-model-invocation',
  ]);
  for (const key of Object.keys(sourceFm)) {
    if (!knownFields.has(key)) droppedFields.push(key);
  }

  const frontmatter: CatalogFrontmatter = {
    id,
    kind: 'skill',
    name: slug,
    title: slugToTitle(slug, displayName, language),
    description,
    language,
    appliesTo: ['**/*'],
    uses: { rules: [], agents: [] },
    tags: tagsFromSlug(slug, language),
    ...(allowedTools && allowedTools.length > 0 ? { allowedTools } : {}),
    ...(argumentHint ? { argumentHint } : {}),
    ...(disableModelInvocation ? { disableModelInvocation } : {}),
  };

  return { frontmatter, droppedFields, bodyPrefix, descriptionSynthesized };
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
