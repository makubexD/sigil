/**
 * Per-kind (rule/agent/skill) frontmatter translators. Split out of translate.ts
 * to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import { slugToTitle } from './translate-shared';
import { splitToolsString, tagsFromSlug, computeDroppedFields } from './translate-helpers';
import type { TranslateOptions, CatalogFrontmatter, TranslateResult } from './translate-shared';

/** Builds a rule's CatalogFrontmatter from its translated fields. */
function buildRuleFrontmatter(
  slug: string,
  description: string,
  appliesTo: string[],
  opts: TranslateOptions,
): CatalogFrontmatter {
  const { language, displayName } = opts;
  return {
    id: `${language}/${slug}`,
    kind: 'rule',
    title: slugToTitle(slug, displayName, opts.prefix),
    description,
    language,
    appliesTo,
    severity: 'recommended',
    extends: [],
    tags: tagsFromSlug(slug, language, opts.prefix),
  };
}

export function translateRule(
  slug: string,
  sourceFm: Record<string, unknown>,
  opts: TranslateOptions,
): TranslateResult {
  // description is the main content field — required
  const description = typeof sourceFm.description === 'string' ? sourceFm.description : '';
  // paths → appliesTo
  const appliesTo = Array.isArray(sourceFm.paths) ? (sourceFm.paths as string[]) : ['**/*'];
  const droppedFields = computeDroppedFields(sourceFm, new Set(['description', 'paths']));

  const syntheticDescription = `${opts.displayName} coding conventions and style guidelines.`;
  const frontmatter = buildRuleFrontmatter(
    slug,
    description || syntheticDescription,
    appliesTo,
    opts,
  );

  return { frontmatter, droppedFields, descriptionSynthesized: !description };
}

/** The translated agent-specific fields, passed as a bundle to {@link buildAgentFrontmatter}. */
interface AgentFields {
  name: string;
  description: string;
  tools: string[];
}

/** Builds an agent's CatalogFrontmatter from its translated fields. */
function buildAgentFrontmatter(
  slug: string,
  fields: AgentFields,
  opts: TranslateOptions,
): CatalogFrontmatter {
  const { language, displayName } = opts;
  const { name, description, tools } = fields;
  return {
    id: `${language}/${slug}`,
    kind: 'agent',
    name,
    title: slugToTitle(slug, displayName, opts.prefix),
    description,
    language,
    tools: tools.length > 0 ? tools : undefined,
    tags: tagsFromSlug(slug, language, opts.prefix),
  };
}

export function translateAgent(
  slug: string,
  sourceFm: Record<string, unknown>,
  opts: TranslateOptions,
): TranslateResult {
  // name comes from frontmatter (same as slug in practice)
  const name = typeof sourceFm.name === 'string' ? sourceFm.name : slug;
  const description = typeof sourceFm.description === 'string' ? sourceFm.description : '';
  const tools = splitToolsString(sourceFm.tools);
  const droppedFields = computeDroppedFields(sourceFm, new Set(['name', 'description', 'tools']));

  const syntheticDescription = `${opts.displayName} specialist agent.`;
  const frontmatter = buildAgentFrontmatter(
    slug,
    { name, description: description || syntheticDescription, tools },
    opts,
  );

  return { frontmatter, droppedFields, descriptionSynthesized: !description };
}

/**
 * Compute the skill's YAML-header description plus its `whenToUse` trigger text.
 *
 * `description` stays single-line for the YAML header (multi-line strings break YAML
 * serialization). `when_to_use` maps straight through to the catalog's `whenToUse` field —
 * it is routing metadata (what makes the model dispatch the skill), not body content, so
 * it must round-trip through frontmatter, not get buried in a body section where it would
 * stop influencing dispatch.
 */
function computeSkillDescription(
  sourceFm: Record<string, unknown>,
  displayName: string,
): { description: string; whenToUse: string | undefined; descriptionSynthesized: boolean } {
  const sourceDescription = typeof sourceFm.description === 'string' ? sourceFm.description : '';
  const whenToUseRaw =
    typeof sourceFm['when_to_use'] === 'string' ? sourceFm['when_to_use'].trim() : '';

  const descriptionSynthesized = !sourceDescription;
  const description = sourceDescription || `${displayName} skill.`;
  const whenToUse = whenToUseRaw ? whenToUseRaw : undefined;

  return { description, whenToUse, descriptionSynthesized };
}

/** Extract the skill's allowed-tools / argument-hint / disable-model-invocation fields. */
function computeSkillToolFields(sourceFm: Record<string, unknown>): {
  allowedTools: string[] | undefined;
  argumentHint: string | undefined;
  disableModelInvocation: true | undefined;
} {
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

  return { allowedTools, argumentHint, disableModelInvocation };
}

/** Optional skill fields spread in only when present (allowedTools/argumentHint/disableModelInvocation). */
function optionalSkillFields(
  toolFields: ReturnType<typeof computeSkillToolFields>,
): Partial<CatalogFrontmatter> {
  const { allowedTools, argumentHint, disableModelInvocation } = toolFields;
  return {
    ...(allowedTools && allowedTools.length > 0 ? { allowedTools } : {}),
    ...(argumentHint ? { argumentHint } : {}),
    ...(disableModelInvocation ? { disableModelInvocation } : {}),
  };
}

/** The translated skill-specific fields, passed as a bundle to {@link buildSkillFrontmatter}. */
interface SkillFields {
  description: string;
  whenToUse: string | undefined;
  toolFields: ReturnType<typeof computeSkillToolFields>;
}

/** Builds a skill's CatalogFrontmatter from its translated description + tool fields. */
function buildSkillFrontmatter(
  slug: string,
  fields: SkillFields,
  opts: TranslateOptions,
): CatalogFrontmatter {
  const { language, displayName } = opts;
  const { description, whenToUse, toolFields } = fields;
  return {
    id: `${language}/${slug}`,
    kind: 'skill',
    name: slug,
    title: slugToTitle(slug, displayName, opts.prefix),
    description,
    language,
    ...(whenToUse ? { whenToUse } : {}),
    uses: { rules: [], agents: [] },
    tags: tagsFromSlug(slug, language, opts.prefix),
    ...optionalSkillFields(toolFields),
  };
}

const SKILL_KNOWN_FIELDS = new Set([
  'description',
  'when_to_use',
  'allowed-tools',
  'argument-hint',
  'disable-model-invocation',
]);

export function translateSkill(
  slug: string,
  sourceFm: Record<string, unknown>,
  opts: TranslateOptions,
): TranslateResult {
  const { description, whenToUse, descriptionSynthesized } = computeSkillDescription(
    sourceFm,
    opts.displayName,
  );
  const toolFields = computeSkillToolFields(sourceFm);
  const droppedFields = computeDroppedFields(sourceFm, SKILL_KNOWN_FIELDS);
  const frontmatter = buildSkillFrontmatter(slug, { description, whenToUse, toolFields }, opts);
  return { frontmatter, droppedFields, descriptionSynthesized };
}
