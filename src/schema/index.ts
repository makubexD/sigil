/**
 * Zod schemas for every artifact kind.
 *
 * These are the single source of truth for frontmatter validation.
 * The emit.ts script in this directory uses `zod-to-json-schema` to write
 * schema/*.schema.json so editors get autocomplete without a build step.
 */
import { z } from 'zod';
import type { ArtifactKind } from '../types';

// ─── Shared fields ────────────────────────────────────────────────────────────

const BaseFields = {
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
   * Optional per-artifact semver. Unused in v1 (the npm package version is
   * the single version); supported for future per-artifact versioning.
   */
  version: z.string().optional(),
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
};

// ─── Skill ───────────────────────────────────────────────────────────────────

export const SkillSchema = z.object({
  ...BaseFields,
  kind: z.literal('skill'),
  /**
   * Invocation name — becomes the Claude Code /name command and Copilot
   * /prompt-name trigger. Must be kebab-case.
   */
  name: z.string().min(1),
  /** Language this skill belongs to. Must match a catalog/languages/<lang>/ directory. */
  language: z.string().min(1),
  /** Canonical file globs that trigger this skill's context. */
  appliesTo: z.array(z.string()).optional().default(['**/*']),
  /**
   * Reuse references: which shared/language rules and agents this skill depends on.
   * The resolver expands these at build time — nothing is copied in the source.
   */
  uses: z
    .object({
      rules: z.array(z.string()).optional().default([]),
      agents: z.array(z.string()).optional().default([]),
    })
    .optional()
    .default({}),
});

// ─── Agent ───────────────────────────────────────────────────────────────────

export const AgentSchema = z.object({
  ...BaseFields,
  kind: z.literal('agent'),
  /** Invocation name — kebab-case. */
  name: z.string().min(1),
  /**
   * Optional: language this agent is scoped to.
   * Omit for shared agents that work across all languages.
   */
  language: z.string().optional(),
  /**
   * Vendor-neutral list of tool capabilities the agent may use.
   * Adapters map these to platform-specific tool names.
   * Examples: "codebase", "terminal", "web-search", "file-read"
   */
  tools: z.array(z.string()).optional(),
  /**
   * Vendor-neutral list of tools this agent must NOT use.
   * Examples: "file-write", "file-delete"
   */
  disallowedTools: z.array(z.string()).optional(),
  /**
   * Claude Code-specific hints. Namespaced so other adapters can ignore them.
   * Adapter reads these and applies them to the agent's Markdown frontmatter.
   */
  claude: z
    .object({
      model: z.enum(['haiku', 'sonnet', 'opus']).optional(),
      effort: z.enum(['low', 'medium', 'high']).optional(),
      maxTurns: z.number().int().positive().optional(),
      isolation: z.enum(['worktree']).optional(),
    })
    .optional(),
});

// ─── Rule ─────────────────────────────────────────────────────────────────────

export const RuleSchema = z.object({
  ...BaseFields,
  kind: z.literal('rule'),
  /** Optional: language this rule targets. Omit for cross-language rules. */
  language: z.string().optional(),
  /** Canonical file globs this rule applies to. Adapters map these to platform syntax. */
  appliesTo: z.array(z.string()).optional().default(['**/*']),
  /** How strongly this rule is enforced. */
  severity: z.enum(['required', 'recommended', 'optional']).optional().default('recommended'),
  /**
   * DRY inheritance: IDs of parent rules whose bodies are prepended to this one.
   * The resolver flattens chains at build time; cycles are a validation error.
   */
  extends: z.array(z.string()).optional().default([]),
});

// ─── Prompt ───────────────────────────────────────────────────────────────────

export const PromptSchema = z.object({
  ...BaseFields,
  kind: z.literal('prompt'),
  /** Optional file globs to scope when this prompt is auto-suggested. */
  appliesTo: z.array(z.string()).optional(),
  /** Named input arguments for parameterised prompts. */
  args: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        required: z.boolean().optional().default(false),
      }),
    )
    .optional(),
});

// ─── Workflow ─────────────────────────────────────────────────────────────────

export const WorkflowSchema = z.object({
  ...BaseFields,
  kind: z.literal('workflow'),
  /**
   * Ordered steps that reference other artifact IDs.
   * Emitted as a multi-step skill/command on each platform.
   */
  steps: z
    .array(
      z.object({
        /** Artifact ID of the skill or prompt to run in this step. */
        ref: z.string(),
        description: z.string().optional(),
      }),
    )
    .min(1),
});

// ─── Registry ─────────────────────────────────────────────────────────────────

const SCHEMAS = {
  skill: SkillSchema,
  agent: AgentSchema,
  rule: RuleSchema,
  prompt: PromptSchema,
  workflow: WorkflowSchema,
} as const;

export type AnySchema = (typeof SCHEMAS)[keyof typeof SCHEMAS];

/** Returns the zod schema for the given artifact kind. Throws on unknown kind. */
export function getSchema(kind: string): AnySchema {
  const schema = SCHEMAS[kind as ArtifactKind];
  if (!schema) {
    throw new Error(
      `No schema registered for kind '${kind}'. Valid kinds: ${Object.keys(SCHEMAS).join(', ')}`,
    );
  }
  return schema;
}

export type SkillFrontmatter = z.infer<typeof SkillSchema>;
export type AgentFrontmatter = z.infer<typeof AgentSchema>;
export type RuleFrontmatter = z.infer<typeof RuleSchema>;
export type PromptFrontmatter = z.infer<typeof PromptSchema>;
export type WorkflowFrontmatter = z.infer<typeof WorkflowSchema>;
