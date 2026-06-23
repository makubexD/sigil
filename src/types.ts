/**
 * Core type definitions for the sigil compiler pipeline.
 * These interfaces flow through Load → Validate → Resolve → Emit.
 */

// ─── Artifact kinds ──────────────────────────────────────────────────────────

export type ArtifactKind = 'skill' | 'agent' | 'rule' | 'prompt' | 'workflow';

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
  id: string; // e.g. "csharp/xunit-testing" or "shared/clean-code"
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
}

// ─── Resolved catalog ─────────────────────────────────────────────────────────

/**
 * An artifact after the Resolve phase.
 * Rules have their `extends` chain flattened; skills have their `uses` closure expanded.
 */
export interface ResolvedArtifact extends Artifact {
  /** For rules: body with all ancestor extends bodies prepended (oldest ancestor first). */
  resolvedBody?: string;
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
  homepage?: string;
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
   * Called by `sigil add`.
   * May be omitted if the target doesn't support partial installs.
   */
  scaffold?(
    artifactId: string,
    catalog: ResolvedCatalog,
    options: ScaffoldOptions,
  ): Promise<FileMap>;

  /**
   * Artifact kinds this target can scaffold.
   * Kinds absent from this list trigger a warn-and-skip during `add` rather than an error.
   * If omitted, all kinds are considered supported (adapters should declare this explicitly).
   */
  supportedKinds?: ArtifactKind[];

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
   * Output-conformance contracts for this target's emitted files.
   * Checked by `build` and `add` after emit; any violation causes a non-zero exit.
   * Each entry maps a path regex to required/forbidden frontmatter keys and body constraints.
   * Files matching no entry are skipped (aggregate files like AGENTS.md have no fixed shape).
   */
  outputContracts?: ContractEntry[];
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
