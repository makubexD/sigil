/**
 * Core type definitions for the sigil compiler pipeline.
 * These interfaces flow through Load → Validate → Resolve → Emit.
 */
import type { TargetCapabilities } from './targets/capability-types';

// ─── Artifact kinds ──────────────────────────────────────────────────────────

export type ArtifactKind =
  | 'skill'
  | 'agent'
  | 'rule'
  | 'prompt'
  | 'workflow'
  | 'hook'
  | 'settings'
  | 'mcp'
  | 'template';

/**
 * A reference file bundled alongside a skill (e.g. references/assertions.md).
 * Loaded from <skill-dir>/references/*.md.
 */
export interface ReferenceFile {
  name: string; // filename, e.g. "assertions.md"
  content: string; // raw file content
}

/**
 * A single parsed artifact from the catalog source.
 * Produced by the Load phase; consumed by Validate and Resolve.
 */
export interface Artifact {
  id: string; // e.g. "csharp/cs-generate-tests" or "shared/clean-code"
  kind: ArtifactKind;
  filePath: string; // absolute path to the source .md file
  frontmatter: Record<string, unknown>;
  body: string; // raw Markdown body (after frontmatter)
  references?: ReferenceFile[]; // only set for skills with a references/ dir
}

// ─── Language metadata ────────────────────────────────────────────────────────

/**
 * Loaded from catalog/languages/<lang>/language.yaml.
 * Provides display info and file glob patterns for each language.
 */
export interface LanguageMetadata {
  id: string; // matches the directory name, e.g. "csharp"
  displayName: string; // e.g. ".NET / C#"
  globs: string[]; // canonical file globs, e.g. ["**/*.cs", "**/*.csproj"]
  icon?: string; // optional emoji or icon name
}

// ─── Loaded catalog ───────────────────────────────────────────────────────────

/** Raw output of the Load phase — no validation or resolution yet. */
export interface LoadedCatalog {
  artifacts: Artifact[];
  byId: Map<string, Artifact>;
  languages: Map<string, LanguageMetadata>; // keyed by language id
  /**
   * Human-readable reasons a source file was skipped during load (e.g. missing
   * `id`/`kind` in frontmatter). Collected rather than printed at load time —
   * load.ts is platform-neutral domain code and must not own presentation;
   * the CLI layer decides whether/how to display these.
   */
  skipWarnings: string[];
}

// ─── Resolved catalog ─────────────────────────────────────────────────────────

/**
 * An artifact after the Resolve phase.
 * Rules have their `extends` chain flattened; skills have their `uses` closure expanded.
 */
export interface ResolvedArtifact extends Artifact {
  /**
   * The artifact's effective body after composition: template slot-filling (if `template:` is
   * set) followed by the `extends` ancestor-prepend (rules only). This is the DEFAULT rendering
   * every adapter gets for free by reading `resolvedBody ?? body`. Adapters that need a different
   * arrangement should build from `resolvedSlots` / `resolvedAncestorBodies` instead — see
   * BodySectionSpec in src/targets/spec-types.ts.
   */
  resolvedBody?: string;
  /**
   * The artifact's slot contents, keyed by slot name, as composed against its `template:` (if
   * any). Lets a target adapter re-arrange, relabel, or split the body differently from the
   * default `resolvedBody` concatenation without any catalog-side change. Undefined when the
   * artifact has no `template:`.
   */
  resolvedSlots?: Record<string, string>;
  /** The `template:` id this artifact was composed against, if any. */
  templateId?: string;
  /**
   * For rules: each ancestor's own resolved body, oldest-first, UNFLATTENED — i.e. the inputs to
   * the `resolvedBody` join, exposed individually so an adapter can render inherited rules as
   * separate sections instead of one concatenated blob.
   */
  resolvedAncestorBodies?: string[];
  /** For skills: the fully resolved rule artifacts from uses.rules (with THEIR extends flattened). */
  resolvedRules?: ResolvedArtifact[];
  /** For skills: agent IDs from uses.agents (looked up at emit time). */
  resolvedAgentIds?: string[];
}

/** Output of the Resolve phase. */
export interface ResolvedCatalog {
  artifacts: ResolvedArtifact[];
  byId: Map<string, ResolvedArtifact>;
  languages: Map<string, LanguageMetadata>;
}

// ─── Compiler output ──────────────────────────────────────────────────────────

/**
 * A flat map of relative output path → file content.
 * Target adapters return this; the CLI then writes it to dist/<target>/.
 */
export type FileMap = Record<string, string>;

// ─── Config merge ops (for hook / settings / mcp kinds) ──────────────────────

/**
 * Merge strategy for a single top-level JSON key.
 *
 *   object-spread — deep-merge (incoming wins per leaf). Used for env, scalars.
 *   array-union   — union + dedup. Used for permissions.allow/deny/ask.
 *   array-append  — concatenate without dedup. Used for hooks arrays.
 */
export type MergeStrategy = 'object-spread' | 'array-union' | 'array-append';

/**
 * Canonical install scope values for config-kind artifacts.
 * Single source of truth — derive ConfigScope from this constant so any
 * z.enum([...]) or allowedValues list can reference CONFIG_SCOPES directly.
 *
 * Scope semantics:
 *   project — shared, git-committed (default). Writes inside projectDir.
 *   local   — personal, not committed. Writes inside projectDir (.local.json variants)
 *             OR inside the home dir for Claude MCP scope.
 *   user    — user-global, applies across all projects. Writes to home dir.
 */
export const CONFIG_SCOPES = ['project', 'local', 'user'] as const;

/** Derived from CONFIG_SCOPES — prefer that constant for runtime validation. */
export type ConfigScope = (typeof CONFIG_SCOPES)[number];

/** Union of the artifact kinds that produce config-merge operations rather than whole files. */
export type ConfigKind = 'hook' | 'settings' | 'mcp';

/**
 * Symbolic root that the CLI resolves to an absolute directory path.
 *
 *   project    — the consumer project root (opts.projectDir). Default.
 *   home       — os.homedir(). Used for Claude user/local MCP + user settings.
 *   vscode-user — VS Code user-profile directory (platform-specific). Used for Copilot user MCP.
 */
export type ConfigRoot = 'project' | 'home' | 'vscode-user';

/**
 * One merge operation produced by a target adapter's scaffoldConfig().
 * Represents "I want to contribute `fragment` to `file` using per-key strategies."
 */
export interface ConfigMergeOp {
  /** Relative path inside the resolved root (e.g. ".claude/settings.json"). */
  file: string;
  /**
   * Symbolic root that the CLI resolves to an absolute directory.
   * Defaults to 'project' when absent (backward-compatible).
   */
  root?: ConfigRoot | undefined;
  /** The JSON sub-tree sigil owns (catalog-display fields like `description` stripped). */
  fragment: Record<string, unknown>;
  /** Per top-level key merge strategy; keys absent from this map default to object-spread. */
  strategy: Record<string, MergeStrategy>;
  /**
   * Human-readable JSON key-path this fragment lands at, for display only
   * (e.g. 'mcpServers', 'servers', 'projects › /abs/dir › mcpServers'). Set by the
   * target's scaffoldConfig — it already knows this shape when building the op, so this
   * mirrors `ConfigScopeInfo.destinations[].section` by construction rather than being
   * re-derived from the fragment shape elsewhere.
   */
  section?: string | undefined;
}

// ─── Config-scope descriptor (provider-declared) ──────────────────────────────

/**
 * One concrete file destination for a (scope, kind) pair, with the absolute path pre-resolved.
 * Produced by Target.configScopes() so the wizard and CLI never need to hardcode paths.
 */
export interface ConfigScopeDestination {
  kind: ConfigKind;
  /** Relative path inside the resolved root (e.g. '.claude/settings.local.json'). */
  file: string;
  root: ConfigRoot;
  /** Absolute path, already resolved for the given projectDir. Display-ready for the user. */
  fullPath: string;
  /**
   * Human-readable JSON key-path where the fragment lands INSIDE the file, using ' › ' as
   * separator (e.g. 'projects › /abs/proj › mcpServers', or 'mcpServers'). Present only when
   * the fragment nests below the file root — used to disambiguate scopes that share a file.
   * Classic case: Claude mcp 'local' and 'user' both write ~/.claude.json, but 'local' goes
   * under projects.<dir>.mcpServers while 'user' goes under the top-level mcpServers key.
   * Undefined means the fragment merges at the file root (settings, hook, etc.).
   */
  section?: string | undefined;
}

/**
 * A scope option a target offers for config-kind installs.
 * Targets return an array of these from configScopes(), ordered by documented precedence
 * (highest-priority scope first). The wizard renders each as a select option whose hint
 * shows the full absolute path(s) so users know exactly where each scope writes.
 */
export interface ConfigScopeInfo {
  /** CLI flag value and internal state key. */
  value: ConfigScope;
  /** Display label shown in the wizard select. */
  label: string;
  /**
   * Priority rank per the platform's documentation, 1 = highest priority.
   * Used to sort the menu (ascending) and annotate the label.
   */
  precedence: number;
  /** True when the file is git-committed and shared with collaborators. */
  shared: boolean;
  /**
   * 'project' — write only affects this repository.
   * 'all-projects' — write affects ALL user projects (home-dir or user-profile file).
   * Drives the blast-radius warning shown before confirming user-scope installs.
   */
  blastRadius: 'project' | 'all-projects';
  /** Short human-readable note shown alongside the full path hint. */
  description: string;
  /** Pre-resolved destination for each config kind in the current selection. */
  destinations: ConfigScopeDestination[];
}

// ─── Target vocabulary + output contracts ─────────────────────────────────────

/**
 * Platform-native vocabulary for a catalog kind.
 * Declares how this target refers to each artifact type in its own ecosystem.
 * Example: a catalog `prompt` becomes a "command" on Claude Code but a "prompt" on Copilot.
 */
export interface KindVocabulary {
  /** Singular noun (e.g. "command" for Claude Code prompts, "instructions" for Copilot rules). */
  noun: string;
  /** Plural label for pickers (e.g. "Commands", "Instructions"). */
  plural: string;
  /** Optional hint describing what this artifact type does on this platform. */
  hint?: string;
}

/** Structural contract for a category of emitted files. */
export interface ArtifactContract {
  /** Frontmatter keys that MUST be present. */
  requiredKeys?: string[];
  /** Frontmatter keys that MUST NOT appear (cross-contamination guard). */
  forbiddenKeys?: string[];
  /** Patterns that MUST NOT appear in the parsed file body. */
  bodyForbids?: { pattern: RegExp; reason: string }[];
}

/** Maps an output path pattern to an artifact contract. */
export interface ContractEntry {
  /** Regex tested against the output file's relative path. */
  match: RegExp;
  /** Human-readable label for this artifact type (used in error messages). */
  label: string;
  /** The structural contract to check against. */
  contract: ArtifactContract;
}

/** A single conformance violation found by checkOutputContract. */
export interface OutputViolation {
  file: string;
  label: string;
  problem: string;
}

/** A single source-convention violation found by checkSourceArtifact. */
export interface SourceViolation {
  /** Absolute or relative file path of the artifact that failed. */
  file: string;
  /** The specific problem detected. */
  problem: string;
}

// ─── Pack config (from packs.yaml) ───────────────────────────────────────────

export interface Pack {
  name: string; // kebab-case, e.g. "dotnet-pack"
  displayName: string; // human-readable, e.g. ".NET / C# Pack"
  description: string;
  languages?: string[]; // language IDs whose artifacts belong to this pack
  artifacts?: string[]; // optional explicit artifact ID list (overrides languages)
}

export interface PacksConfig {
  packs: Pack[];
}

// ─── Target adapter interface ─────────────────────────────────────────────────

export interface CompileOptions {
  /** npm package version — written into generated plugin.json version fields. */
  version: string;
  packs: Pack[];
  /**
   * Project homepage URL (from package.json `homepage`).
   * Written into generated marketplace.json and plugin.json author URL fields.
   * Falls back to a placeholder when absent.
   */
  homepage?: string | undefined;
}

export interface ScaffoldOptions {
  /** Absolute path to the consumer's project root. */
  projectDir: string;
  /** When true, overwrite existing files; when false, skip. */
  overwrite?: boolean;
  /**
   * When false, skip writing the dependency closure (rules/agents referenced by `uses`).
   * Defaults to true — a skill scaffold normally writes its rule and agent dependencies.
   */
  includeDeps?: boolean;
  /**
   * Install scope for config-kind artifacts (hook, settings, mcp).
   * Controls which destination file is written to. Defaults to 'project'.
   * Ignored for whole-file kinds (skill, agent, rule, prompt, workflow).
   */
  scope?: ConfigScope;
  /**
   * The set of artifact IDs being co-installed in this session.
   * Adapters use this to conditionally render `relatedArtifacts` Boundary sections —
   * only emitting escalation entries whose targets are actually being installed alongside
   * this artifact. When absent, no Boundary section is rendered (avoids dangling refs).
   */
  coInstallSet?: Set<string>;
}

/**
 * The interface every platform adapter must implement.
 * Register in src/targets/index.ts.
 */
export interface Target {
  /** Identifier used in --target CLI flag and dist/<name>/ output directory. */
  name: string;

  /**
   * Full build: compile the entire resolved catalog into a FileMap.
   * Called by `sigil build`.
   */
  compile(catalog: ResolvedCatalog, options: CompileOptions): Promise<FileMap>;

  /**
   * Partial scaffold: emit only the files needed for one artifact and its closure.
   * Called by `sigil add` for whole-file kinds (skill, agent, rule, prompt, workflow).
   * May be omitted if the target doesn't support partial installs.
   */
  scaffold?(
    artifactId: string,
    catalog: ResolvedCatalog,
    options: ScaffoldOptions,
  ): Promise<FileMap>;

  /**
   * Config scaffold: emit merge operations for config-kind artifacts
   * (hook, settings, mcp). These merge into user-owned JSON files rather than
   * writing whole files. Called by `sigil add` when artifact.kind is a config kind.
   * May be omitted if the target doesn't support config kinds.
   */
  scaffoldConfig?(
    artifactId: string,
    catalog: ResolvedCatalog,
    options: ScaffoldOptions,
  ): Promise<ConfigMergeOp[]>;

  /**
   * Which artifact kinds this target delivers on each channel (scaffold / plugin) — the single
   * declaration of kind support, read through src/targets/capabilities.ts (`supportedKinds`,
   * `supportsKind`, `nativeKinds`). Kinds a channel marks `none` trigger a warn-and-skip during
   * `add` rather than an error. Declared in src/targets/<provider>/capabilities.ts.
   */
  readonly capabilities: TargetCapabilities;

  /**
   * Platform-native vocabulary for each artifact kind.
   * Used by the wizard and CLI to show the right noun/plural for this platform's ecosystem.
   * Falls back to the raw catalog kind when absent or undefined for a specific kind.
   *
   * Example: Claude Code declares prompt → { noun: 'command', plural: 'Commands' }
   *          Copilot declares rule → { noun: 'instructions', plural: 'Instructions' }
   */
  vocabulary?: Partial<Record<ArtifactKind, KindVocabulary>>;

  /**
   * Scope options this target offers for config-kind installs, ordered by documented precedence
   * (highest-priority first). Each destination's fullPath is pre-resolved for the given projectDir,
   * so the wizard and CLI can show the full absolute target path without any provider-specific
   * branching in the UI layer. Return an empty array (or omit) if this target has no config kinds.
   *
   * Example ordering: Claude returns [local, project, user] (local overrides project overrides user).
   * Copilot returns [project, user] (no distinct local MCP scope in VS Code).
   */
  configScopes?(kinds: ConfigKind[], projectDir: string): ConfigScopeInfo[];

  /**
   * Output-conformance contracts for this target's emitted files.
   * Checked by `build` and `add` after emit; any violation causes a non-zero exit.
   * Each entry maps a path regex to required/forbidden frontmatter keys and body constraints.
   * Files matching no entry are skipped (aggregate files like AGENTS.md have no fixed shape).
   */
  outputContracts?: ContractEntry[];

  /**
   * Directories created by `sigil init` for this target (relative to project root).
   * Declaring them here lets the `init` command iterate all targets without hardcoding
   * target names or directory structures in shared CLI code.
   *
   * Example: Claude Code declares ['.claude/skills', '.claude/rules', '.claude/agents']
   */
  initDirs?: string[];

  /**
   * File-system markers that indicate this target is already installed in a project.
   * `detectProjectTarget` scans getAllTargets() in registration order and returns the
   * first target whose marker directories (relative to projectDir) are present on disk.
   * Declaring them here removes the need for a hardcoded dir→name switch in the CLI.
   *
   * Example: Claude Code declares ['.claude'], Copilot declares ['.github']
   */
  projectMarkers?: string[];

  /** Human-readable name shown in wizard pickers. Falls back to `name` when absent. */
  displayName?: string;

  /** One-line install-destination hint shown in wizard pickers (e.g. 'writes to .claude/'). */
  installHint?: string;

  /**
   * Platform-namespaced authoring fields this target contributes to `sigil patch`.
   * Each becomes a `--<target.name>-<key>` CLI option and writes to
   * `<target.name>.<key>` in the artifact's source frontmatter. Lets a target declare
   * its own authoring surface without cli.ts hardcoding per-platform flags.
   */
  authoringFields?: readonly AuthoringField[];

  /**
   * Frontmatter fields this target adds to a given kind, nested under a `<target.name>:` key
   * in catalog source (e.g. `claude: { model: opus }`) rather than in the neutral schema.
   *
   * This is THE extension point for provider-specific frontmatter. A field that only one
   * provider understands must go here, never as a bare top-level field in src/schema/index.ts —
   * see CLAUDE.md's platform-neutral pipeline invariant. src/validate/schema-checks.ts composes
   * the effective per-artifact schema by merging every registered target's declaration here for
   * the artifact's kind; it iterates the target registry and never names a provider, so adding a
   * new target's fields never requires editing the neutral schema or the validator.
   *
   * Each value is a zod raw shape (the second argument to `z.object()`), e.g.
   * `{ skill: { allowedTools: z.array(z.string()).optional() } }`.
   * Use `unknown` here (not a template param) to avoid coupling this file to zod's types;
   * consumers cast via `z.object(shape as z.ZodRawShape)`.
   */
  frontmatterExtensions?: Partial<Record<ArtifactKind, Record<string, unknown>>>;
}

/** One platform-namespaced authoring field a target contributes to `sigil patch`/`sigil new`. */
export interface AuthoringField {
  /** Flag suffix and frontmatter key, e.g. 'model' → --claude-model → claude.model */
  readonly key: string;
  readonly description: string;
  /** Kinds this field applies to; omitted = all kinds. */
  readonly kinds?: readonly ArtifactKind[];
  readonly type?: 'string' | 'int';
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationError {
  artifactId: string;
  filePath: string;
  error: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}
