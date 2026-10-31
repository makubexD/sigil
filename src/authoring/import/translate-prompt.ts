/**
 * Prompt frontmatter translator. Split out of translate-kinds.ts, which is near the repo's
 * module-size threshold; translate.ts dispatches here for `kind: 'prompt'`.
 *
 * @module
 */
import { slugToTitle } from './translate-shared';
import { tagsFromSlug, computeDroppedFields } from './translate-helpers';
import { isPlainObject } from '../../config-merge/primitives';
import type {
  TranslateOptions,
  CatalogFrontmatter,
  TranslateResult,
  PromptArg,
} from './translate-shared';

const PROMPT_KNOWN_FIELDS = new Set(['description', 'args']);

/** One source arg copied field by field, or nothing when it isn't a named object. */
function promptArg(raw: unknown): PromptArg | undefined {
  if (!isPlainObject(raw) || typeof raw.name !== 'string') return undefined;
  const { name, description } = raw;
  return typeof description === 'string' ? { name, description } : { name };
}

/**
 * The usable source `args`. Each item is copied, never passed through: YAML aliases can make a
 * short list expand without limit when it is written out, or point back at itself.
 */
function promptArgs(sourceFm: Record<string, unknown>): PromptArg[] {
  const raw = sourceFm.args;
  if (!Array.isArray(raw)) return [];
  return raw.map(promptArg).filter(arg => arg !== undefined);
}

/** True when the source `args` held anything that didn't survive `promptArgs`. */
function lostArgs(sourceFm: Record<string, unknown>, args: PromptArg[]): boolean {
  const raw = sourceFm.args;
  if (raw === undefined) return false;
  return !Array.isArray(raw) || raw.length !== args.length;
}

/** Builds a prompt's CatalogFrontmatter from its translated fields. */
function buildPromptFrontmatter(
  slug: string,
  description: string,
  args: PromptArg[],
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
    ...(args.length > 0 ? { args } : {}),
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
  if (lostArgs(sourceFm, args)) droppedFields.push('args');

  const syntheticDescription = `${opts.displayName} prompt.`;
  const frontmatter = buildPromptFrontmatter(slug, description || syntheticDescription, args, opts);

  return { frontmatter, droppedFields, descriptionSynthesized: !description };
}
