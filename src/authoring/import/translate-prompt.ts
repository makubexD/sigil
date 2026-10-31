/**
 * Prompt frontmatter translator. Split out of translate-kinds.ts, which is near the repo's
 * module-size threshold; translate.ts dispatches here for `kind: 'prompt'`.
 *
 * @module
 */
import { slugToTitle } from './translate-shared';
import { tagsFromSlug, computeDroppedFields } from './translate-helpers';
import type {
  TranslateOptions,
  CatalogFrontmatter,
  TranslateResult,
  PromptArg,
} from './translate-shared';

const PROMPT_KNOWN_FIELDS = new Set(['description', 'args']);

/** The source `args` list, only when it is a non-empty array. */
function promptArgs(sourceFm: Record<string, unknown>): PromptArg[] | undefined {
  const raw = sourceFm.args;
  return Array.isArray(raw) && raw.length > 0 ? (raw as PromptArg[]) : undefined;
}

/** Builds a prompt's CatalogFrontmatter from its translated fields. */
function buildPromptFrontmatter(
  slug: string,
  description: string,
  args: PromptArg[] | undefined,
  opts: TranslateOptions,
): CatalogFrontmatter {
  const { language, displayName } = opts;
  return {
    id: `${language}/${slug}`,
    kind: 'prompt',
    title: slugToTitle(slug, displayName, opts.prefix),
    description,
    language,
    tags: tagsFromSlug(slug, language, opts.prefix),
    ...(args ? { args } : {}),
  };
}

export function translatePrompt(
  slug: string,
  sourceFm: Record<string, unknown>,
  opts: TranslateOptions,
): TranslateResult {
  const description = typeof sourceFm.description === 'string' ? sourceFm.description : '';
  const args = promptArgs(sourceFm);
  const droppedFields = computeDroppedFields(sourceFm, PROMPT_KNOWN_FIELDS);

  const syntheticDescription = `${opts.displayName} prompt.`;
  const frontmatter = buildPromptFrontmatter(slug, description || syntheticDescription, args, opts);

  return { frontmatter, droppedFields, descriptionSynthesized: !description };
}
