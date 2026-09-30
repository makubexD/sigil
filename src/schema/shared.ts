/**
 * Zod field groups shared across multiple per-kind schemas — split out of index.ts (partly to
 * stay under the file's max-lines cap, partly because template.ts also needs BaseFields/DocRef
 * and importing them from index.ts would create a cycle: index.ts assembles SCHEMAS from
 * TemplateSchema, which is defined in template.ts).
 */
import { z } from 'zod';

/**
 * Path-safety guards for `id`/`name` frontmatter fields that adapters interpolate directly into
 * output file paths (e.g. `.github/agents/${name}.agent.md`, `id.replace('/', '-')` slugs) with
 * no separate containment check at the write site. Rejecting `..`, path separators beyond the
 * documented "<namespace>/<name>" (or template's "<namespace>/templates/<name>") shape, and
 * anything but lowercase-kebab segments here — enforced by `checkSchema` inside `validateCatalog`,
 * the actual `sigil validate`/`sigil build` gate — is the fix for the 2026-08-22 audit's path-
 * traversal finding (docs/decisions/catalog-benchmark-audit-2026-08-22.md F22): the prior sole
 * defense, `checkNameConsistency`, is wired only into authoring-only commands, never into the
 * pipeline every catalog source actually passes through.
 */
const KEBAB_SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*';
/** A single path-safe kebab-case segment — for `name` fields used as a bare output filename. */
export const KEBAB_NAME_RE = new RegExp(`^${KEBAB_SEGMENT}$`);
/** One to three kebab segments joined by `/` — for `id`, which is namespaced by convention. */
export const KEBAB_ID_RE = new RegExp(`^${KEBAB_SEGMENT}(?:/${KEBAB_SEGMENT}){1,2}$`);

/**
 * Marks an artifact as retired-but-still-resolvable — never removed outright, since `uses:`/
 * `extends:` references and existing installs must keep resolving. `sigil validate` warns (never
 * errors) when a live artifact depends on a deprecated one; `sigil list`/`search`/`get` label it;
 * `sigil add` warns and points at `supersededBy` when set; `sigil prune` (src/commands/prune.ts)
 * is the command that acts on it for already-installed consumers.
 */
export const DeprecatedSchema = z.object({
  /** Version this artifact was deprecated in (informational — no semver comparison is performed). */
  since: z.string().min(1),
  /** Why it was retired — shown by `sigil list`/`get` and in `sigil prune`'s report. */
  reason: z.string().min(1),
  /** Optional: id of the artifact that replaces it, offered as a concrete `sigil add` line. */
  supersededBy: z.string().optional(),
});

export type Deprecated = z.infer<typeof DeprecatedSchema>;

export const BaseFields = {
  /** Unique artifact identifier. Convention: "shared/<name>" or "<language>/<name>". */
  id: z
    .string()
    .min(1, 'id is required')
    .regex(
      KEBAB_ID_RE,
      'id must be namespaced kebab-case (e.g. "shared/foo", "typescript/foo-bar") — no "..", uppercase, or path separators beyond the namespace slash',
    ),
  /** Discriminator for the artifact kind. */
  kind: z.string(),
  /** Short human-readable title. */
  title: z.string().min(1, 'title is required'),
  /** One-line description used in catalog listings and platform descriptions. */
  description: z.string().min(1, 'description is required'),
  /** Discovery tags. */
  tags: z.array(z.string()).optional().default([]),
  /**
   * Optional: restrict this artifact to a subset of platforms.
   * Absent (the default) = emits to every registered target whose capability table
   * (src/targets/<provider>/capabilities.ts) supports this kind — the DRY auto-propagation default.
   * Present = emits only to the listed target names, intersected with targets
   * that actually support the kind.
   * Normalization rule: if the set equals all kind-supporting targets, remove
   * this field rather than listing them all.
   * Valid names are registered target names (e.g. "claude", "copilot").
   */
  platforms: z.array(z.string()).optional(),
  /** Absent (the default) = live. Present = retired; see {@link DeprecatedSchema}. */
  deprecated: DeprecatedSchema.optional(),
};

/**
 * A dated citation to the official provider documentation that a template's structure (or a
 * spec's field mapping) is following. `verifiedOn` is a manual field — nothing updates it
 * automatically — so `sigil sync --stale` can flag entries whose provider docs have not been
 * re-checked in a while (docs/reference/spec.md documents the review cadence).
 */
export const DocRefSchema = z.object({
  url: z.string().url(),
  /** Date (YYYY-MM-DD) this URL was last confirmed to still describe the cited structure. */
  verifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'verifiedOn must be YYYY-MM-DD'),
  /** What this specific document establishes (kept short — shown in `sigil sync` output). */
  covers: z.string().min(1),
});

export type DocRef = z.infer<typeof DocRefSchema>;
