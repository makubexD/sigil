/**
 * Zod schemas for every artifact kind.
 *
 * These are the single source of truth for frontmatter validation.
 * The emit.ts script in this directory uses `zod-to-json-schema` to write
 * schema/*.schema.json so editors get autocomplete without a build step.
 */
import { z } from 'zod';
import type { ArtifactKind } from '../types';
import { CONFIG_SCOPES } from '../types';
import { BaseFields, KEBAB_NAME_RE } from './shared';
import { TemplateSchema } from './template';

export { TemplateSchema } from './template';
export type { TemplateFrontmatter } from './template';
export { DocRefSchema, DeprecatedSchema } from './shared';
export type { DocRef, Deprecated } from './shared';

// ─── Related artifact reference ───────────────────────────────────────────────

/**
 * A structured cross-reference to a sibling artifact.
 * Replaces hard-coded catalog IDs in `## Boundary` body prose and descriptions.
 * Adapters render escalation/routing sections conditionally — only when the
 * referenced artifact is co-present in the install/build set.
 */
const RelatedArtifactSchema = z.object({
  /** Catalog artifact ID of the related artifact (e.g. "csharp/cs-security-auditor"). */
  id: z.string().min(1),
  /**
   * Nature of the relationship:
   *   escalates-to  — delegate to this artifact when this one's scope is exceeded.
   *   complements   — parallel specialist with a distinct, non-overlapping scope.
   *   see-also      — loosely related; surfaced for discovery, no strong routing implied.
   */
  relation: z.enum(['escalates-to', 'complements', 'see-also']),
  /** One-line explanation shown in the rendered Boundary section. */
  reason: z.string().min(1),
});

export type RelatedArtifact = z.infer<typeof RelatedArtifactSchema>;

// ─── Skill ───────────────────────────────────────────────────────────────────

export const SkillSchema = z.object({
  ...BaseFields,
  kind: z.literal('skill'),
  /**
   * Optional: id of a `template` artifact whose slots compose this artifact's body at resolve
   * time. See catalog/shared/templates/ and src/templates.ts. Absent = hand-authored body, no
   * composition — always valid, and the only option for genuinely one-off artifacts.
   */
  template: z.string().optional(),
  /**
   * Invocation name — becomes the Claude Code /name command and Copilot
   * /prompt-name trigger. Must be kebab-case — enforced, since adapters interpolate this
   * directly into an output file path with no separate containment check (F22).
   */
  name: z.string().min(1).regex(KEBAB_NAME_RE, 'name must be kebab-case'),
  /**
   * Language this skill belongs to. Must match a catalog/languages/<lang>/ directory.
   * Omit for a shared, stack-agnostic skill (catalog/shared/skills/) — e.g. one that carries a
   * reference file per stack instead of belonging to a single language namespace.
   */
  language: z.string().min(1).optional(),
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
  /**
   * Tool capabilities the skill is allowed to use (platform-specific invocation).
   * Emitted as `allowed-tools:` in Claude Code SKILL.md frontmatter.
   * Absent = platform default (no restriction).
   */
  allowedTools: z.array(z.string()).optional(),
  /**
   * Autocomplete hint shown in the /name picker (e.g. "[file] [--flag]").
   * Emitted as `argument-hint:` in Claude Code SKILL.md frontmatter.
   */
  argumentHint: z.string().optional(),
  /**
   * When true the skill is invoked by the user, not by the AI itself.
   * Emitted as `disable-model-invocation: true` in Claude Code SKILL.md.
   * Use for workflow scripts like a release command.
   */
  disableModelInvocation: z.boolean().optional(),
  /**
   * Trigger phrases / example requests that tell the model when to invoke this skill —
   * distinct from `description`, which says what the skill does. Claude Code appends this
   * to `description` in the skill listing (combined text capped at 1,536 chars) and uses it
   * to decide whether to dispatch. Skills without one are frequently invisible to routing —
   * see docs/decisions/ for the audit that established this. Claude emits it natively as
   * `when_to_use:` frontmatter; Copilot's SKILL.md frontmatter carries only `name` +
   * `description`, so this renders instead as a leading `## When to Use` body section — see
   * copilot/spec/skill.ts's whenToUseSection.
   */
  whenToUse: z.string().optional(),
  /**
   * When true, only the user can invoke this skill (`/name`) — the model never dispatches it
   * automatically, but its description is still resident so the model can *recommend* it.
   * Emitted as `user-invocable: false` in Claude Code SKILL.md. Claude-only.
   * Not the same as `disableModelInvocation`, which is the inverse: model-only, no `/name`.
   */
  userInvocable: z.boolean().optional(),
  /**
   * When "fork", the skill runs in its own subagent context instead of the main thread —
   * appropriate for skills whose intermediate work (audits, scaffolding) is long but whose
   * caller only needs the final report. Emitted as `context: fork` in Claude Code SKILL.md.
   * Claude-only.
   */
  skillContext: z.enum(['fork']).optional(),
  /**
   * Structured cross-references to sibling artifacts.
   * Adapters render these conditionally when co-present siblings are installed.
   */
  relatedArtifacts: z.array(RelatedArtifactSchema).optional(),
});

// ─── Agent ───────────────────────────────────────────────────────────────────

/**
 * Both providers give an agent every tool when its frontmatter has no `tools:` line, and an empty
 * list emits no line — so `tools: []` would silently mean "all tools", the opposite of what it says.
 */
const EMPTY_TOOL_LIST = 'must list at least one tool; omit the field instead of leaving it empty';

export const AgentSchema = z.object({
  ...BaseFields,
  kind: z.literal('agent'),
  /** Optional: id of a `template` artifact whose slots compose this artifact's body. */
  template: z.string().optional(),
  /** Invocation name — kebab-case, enforced (F22 — interpolated directly into an output path). */
  name: z.string().min(1).regex(KEBAB_NAME_RE, 'name must be kebab-case'),
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
  tools: z.array(z.string()).min(1, EMPTY_TOOL_LIST).optional(),
  /**
   * Vendor-neutral list of tools this agent must NOT use.
   * Examples: "file-write", "file-delete"
   */
  disallowedTools: z.array(z.string()).min(1, EMPTY_TOOL_LIST).optional(),
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
      /**
       * Catalog skill ids preloaded into the subagent's context at startup (Claude Code's
       * `skills:` field). Validated by the reference graph; the adapter emits skill names.
       */
      skills: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  /**
   * Structured cross-references to sibling artifacts.
   * Adapters render these as a Boundary/Escalation section ONLY when the
   * referenced artifacts are co-present in the install or build set.
   * Replaces hard-coded catalog IDs in body prose and descriptions.
   */
  relatedArtifacts: z.array(RelatedArtifactSchema).optional(),
});

// ─── Rule ─────────────────────────────────────────────────────────────────────

export const RuleSchema = z.object({
  ...BaseFields,
  kind: z.literal('rule'),
  /**
   * Optional: id of a `template` artifact whose slots compose this artifact's body. Composition
   * order when both `template` and `extends` are set: template composes this artifact's own
   * body first, THEN the extends ancestor-prepend wraps around that — see src/resolve.ts.
   */
  template: z.string().optional(),
  /** Optional: language this rule targets. Omit for cross-language rules. */
  language: z.string().optional(),
  /** Canonical file globs this rule applies to. Adapters map these to platform syntax. */
  appliesTo: z.array(z.string()).optional().default(['**/*']),
  /**
   * Why this rule's `appliesTo` is deliberately unscoped (`["**\/*"]`). Present only on
   * rules that intentionally match every file; suppresses validate's no-op-appliesTo
   * warning. Absent (or empty) on any rule that should be narrowed instead.
   */
  appliesToRationale: z.string().min(1).optional(),
  /** How strongly this rule is enforced. */
  severity: z.enum(['required', 'recommended', 'optional']).optional().default('recommended'),
  /**
   * DRY inheritance: IDs of parent rules whose bodies are prepended to this one.
   * The resolver flattens chains at build time; cycles are a validation error.
   */
  extends: z.array(z.string()).optional().default([]),
  /**
   * Structured cross-references to sibling artifacts.
   * Adapters render these conditionally when co-present siblings are installed.
   */
  relatedArtifacts: z.array(RelatedArtifactSchema).optional(),
});

// ─── Prompt ───────────────────────────────────────────────────────────────────

export const PromptSchema = z.object({
  ...BaseFields,
  kind: z.literal('prompt'),
  /** Optional: id of a `template` artifact whose slots compose this artifact's body. */
  template: z.string().optional(),
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
  /** Optional: id of a `template` artifact whose slots compose this artifact's body. */
  template: z.string().optional(),
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'SubagentStop',
  'Stop',
  'SessionStart',
  'Notification',
] as const;

export const HookSchema = z.object({
  ...BaseFields,
  kind: z.literal('hook'),
  /** Optional: language scope for this hook. Omit for shared/all-language hooks. */
  language: z.string().optional(),
  /**
   * Default install scope recommended by the catalog author.
   * Overridable by --scope flag or wizard selection at install time.
   * 'project' (default) = .claude/settings.json (git-committed).
   * 'local'             = .claude/settings.local.json (gitignored).
   * 'user'              = ~/.claude/settings.json (user-global).
   */
  defaultScope: z.enum(CONFIG_SCOPES).optional(),
  /**
   * Claude Code lifecycle event that triggers this hook.
   * Maps directly to the settings.json hooks key.
   */
  event: z.enum(HOOK_EVENTS),
  /**
   * Tool-name regex filter — Claude Code `matcher` field.
   * Only used for PreToolUse/PostToolUse. Defaults to '*' (all tools).
   */
  matcher: z.string().optional().default('*'),
  /**
   * Shell command to run when the hook fires, or — with `args` — the executable to spawn.
   */
  command: z.string().min(1, 'command is required'),
  /**
   * Exec form: when set, `command` is spawned directly with these arguments and no shell
   * (code.claude.com/docs/en/hooks, "Exec form and shell form"). Prefer it for any hook whose
   * exit code matters: on Windows without Git Bash, shell-form hooks run through PowerShell,
   * which reports a native command's exit code 2 as 1, so a blocking hook stops blocking.
   */
  args: z.array(z.string()).optional(),
  /** Optional timeout in seconds for the hook command (copied verbatim into Claude settings, where the unit is seconds). */
  timeout: z.number().int().positive().optional(),
});

// ─── Settings ─────────────────────────────────────────────────────────────────

export const SettingsSchema = z.object({
  ...BaseFields,
  kind: z.literal('settings'),
  /** Optional: language scope. Omit for global settings. */
  language: z.string().optional(),
  /**
   * Default install scope recommended by the catalog author.
   * 'project' (default) = .claude/settings.json.
   * 'local'             = .claude/settings.local.json.
   * 'user'              = ~/.claude/settings.json.
   */
  defaultScope: z.enum(CONFIG_SCOPES).optional(),
  /**
   * Permissions fragment — merged into settings.json permissions using array-union.
   * Allows adding to allow/deny/ask lists without replacing existing entries.
   */
  permissions: z
    .object({
      allow: z.array(z.string()).optional(),
      deny: z.array(z.string()).optional(),
      ask: z.array(z.string()).optional(),
    })
    .optional(),
  /** Environment variable additions — merged per-key (incoming wins on collision). */
  env: z.record(z.string(), z.string()).optional(),
  /** Claude model override. */
  model: z.string().optional(),
  /** Status line configuration — passed through to settings.json as-is. */
  statusLine: z.unknown().optional(),
});

// ─── MCP ──────────────────────────────────────────────────────────────────────

const StdioServerSchema = z.object({
  /** Shell command to launch the MCP server process. */
  command: z.string().min(1, 'command is required'),
  /** Arguments to pass to the command. */
  args: z.array(z.string()).optional(),
  /** Environment variables for the server process. */
  env: z.record(z.string(), z.string()).optional(),
});

const RemoteServerSchema = z.object({
  type: z.enum(['http', 'sse']),
  /** Full URL of the remote MCP server endpoint. */
  url: z.string().url(),
  /** HTTP headers to include (e.g. Authorization). */
  headers: z.record(z.string(), z.string()).optional(),
});

export const McpSchema = z.object({
  ...BaseFields,
  kind: z.literal('mcp'),
  /** Optional: language scope. Omit for shared MCP servers. */
  language: z.string().optional(),
  /**
   * Default install scope recommended by the catalog author.
   * Claude: 'project' = .mcp.json; 'local' = ~/.claude.json per-project; 'user' = ~/.claude.json.
   * Copilot: 'project'/'local' = .vscode/mcp.json + .mcp.json (Copilot CLI); 'user' = VS Code user-profile mcp.json.
   */
  defaultScope: z.enum(CONFIG_SCOPES).optional(),
  /**
   * The MCP server config — either stdio (command + args) or remote (type + url).
   * The server key in mcpServers defaults to the artifact's `name` field.
   */
  server: z.union([StdioServerSchema, RemoteServerSchema]),
});

// TemplateSchema now lives in ./template.ts (imported above) — kept out of this file to stay
// under the max-lines cap; BaseFields/DocRefSchema live in ./shared.ts for the same reason and
// because template.ts needs them too (importing them from this file would cycle back through
// the SCHEMAS map below).

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Exported (not just module-local) so src/schema/emit.ts can derive its JSON-Schema-file list
 * from this map instead of hand-listing kinds a second time — a kind added here without being
 * added to ArtifactKind/KIND_REGISTRY still fails to compile elsewhere, and a kind added to both
 * of those but forgotten here now fails schema/emit.ts's own coverage check (see emit.ts) rather
 * than silently shipping without a schema/<kind>.schema.json.
 */
export const SCHEMAS = {
  skill: SkillSchema,
  agent: AgentSchema,
  rule: RuleSchema,
  prompt: PromptSchema,
  workflow: WorkflowSchema,
  hook: HookSchema,
  settings: SettingsSchema,
  mcp: McpSchema,
  template: TemplateSchema,
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
export type HookFrontmatter = z.infer<typeof HookSchema>;
export type SettingsFrontmatter = z.infer<typeof SettingsSchema>;
export type McpFrontmatter = z.infer<typeof McpSchema>;
