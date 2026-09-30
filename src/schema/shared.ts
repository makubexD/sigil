/**
 * Zod field groups shared across multiple per-kind schemas — split out of index.ts (partly to
 * stay under the file's max-lines cap, partly because template.ts also needs BaseFields/DocRef
 * and importing them from index.ts would create a cycle: index.ts assembles SCHEMAS from
 * TemplateSchema, which is defined in template.ts).
 */
import { z } from 'zod';

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
  id: z.string().min(1, 'id is required'),
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
   * Absent (the default) = emits to every registered target whose supportedKinds
   * includes this kind — the DRY auto-propagation default.
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
