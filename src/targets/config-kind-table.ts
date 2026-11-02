/**
 * A target's config kinds as data, instead of hand-rolled dispatch in its adapter.
 *
 * A target that writes config-kind artifacts (`hook`, `settings`, `mcp`) opts in by declaring
 * `readonly configKinds: ConfigKindTable` on its `Target` (src/types.ts). Each writer holds one
 * kind's JSON section, the file it lands in for every scope it supports, the op builder, and an
 * optional skip reason. Every helper here takes that table, so the target's `configScopes`,
 * `scaffoldConfig`, `configSkipReason` and destination lookup are derivations with no per-target
 * branch:
 *
 *   configScopes(kinds, dir) → configScopesFrom(table, scopes, kinds, dir)
 *   scaffoldConfig(...)      → scaffoldConfigFrom(table, artifact, options, name)
 *   configSkipReason(...)    → configSkipReasonFrom(table, artifact)
 *   destination lookup       → destinationFor(table, kind, scope, name)
 *
 * A scope a writer does not list is refused, and a kind absent from the table is "not supported",
 * with the table's own kind list in the message. Refusal text keeps a scope's `display` next to
 * its file, because the same relative path can sit under different roots (project vs home vs
 * `$CODEX_HOME`).
 *
 * @module
 */
import path from 'path';
import { resolveConfigRoot } from '../config-utils';
import { SigilError } from '../errors';
import { CONFIG_SCOPES } from '../types';
import type {
  Artifact,
  ConfigKind,
  ConfigMergeOp,
  ConfigRoot,
  ConfigScope,
  ConfigScopeDestination,
  ConfigScopeInfo,
  ScaffoldOptions,
} from '../types';

/** One scope's destination for a config kind: the file, its root, and its refusal text. */
export interface ConfigKindDestination {
  /** Relative path inside the resolved root (e.g. `.cursor/hooks.json`). */
  file: string;
  /** Symbolic root the CLI resolves to an absolute directory (src/config-utils.ts). */
  root: ConfigRoot;
  /**
   * The parenthesized text in a refusal, e.g. `.cursor/hooks.json, git-committed`,
   * `~/.cursor/hooks.json, all projects` or `$CODEX_HOME/hooks.json, default ~/.codex/hooks.json`.
   */
  display: string;
}

/** Everything one target needs for one config kind: its section, destinations and builders. */
export interface ConfigKindWriter {
  /** Human-readable JSON key-path the fragment lands at (e.g. `hooks`, `mcpServers`). */
  section: string;
  /** The scopes this writer supports; a scope absent here is refused by `destinationFor`. */
  destinations: Partial<Record<ConfigScope, ConfigKindDestination>>;
  /** The merge ops an install of `artifact` at `scope` contributes. */
  buildOps(artifact: Artifact, scope: ConfigScope): ConfigMergeOp[];
  /** A reason this target cannot render the artifact, or undefined when it can. */
  skipReason?(artifact: Artifact): string | undefined;
}

/** The config kinds a target writes, keyed by kind. Absent kinds are not written. */
export type ConfigKindTable = Partial<Record<ConfigKind, ConfigKindWriter>>;

/** At most this many kinds join with "and"; more take the comma list. */
const MAX_AND_JOINED = 2;

/** `'hook'`, `'hook' and 'mcp'`, or `'a', 'b' and 'c'` — in the table's key order. */
function quotedKinds(kinds: ConfigKind[]): string {
  const quoted = kinds.map(kind => `'${kind}'`);
  if (quoted.length <= MAX_AND_JOINED) return quoted.join(' and ');
  return `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}`;
}

/** The unsupported-kind message, listing the table's kinds (`config kind` when there is one). */
function unknownKindMessage(table: ConfigKindTable, kind: ConfigKind, targetName: string): string {
  const kinds = Object.keys(table) as ConfigKind[];
  const noun = kinds.length === 1 ? 'config kind' : 'config kinds';
  return `${targetName} supports only the ${quotedKinds(kinds)} ${noun}, not '${kind}'.`;
}

/** The writer for `kind`, or the unsupported-kind error naming `targetName`. */
function requireWriter(
  table: ConfigKindTable,
  kind: ConfigKind,
  targetName: string,
): ConfigKindWriter {
  const writer = table[kind];
  if (!writer) throw new SigilError(unknownKindMessage(table, kind, targetName));
  return writer;
}

/** The phrase naming a refused scope; exhaustive so a new scope fails to compile. */
const SCOPE_PHRASES: Record<ConfigScope, string> = {
  local: 'personal per-project',
  project: 'project',
  user: 'user-level',
};

/** `'project' scope (.cursor/hooks.json, git-committed) or 'user' scope (~/…)`, in scope order. */
function scopeChoices(writer: ConfigKindWriter): string {
  return CONFIG_SCOPES.flatMap(scope => {
    const destination = writer.destinations[scope];
    return destination ? [`'${scope}' scope (${destination.display})`] : [];
  }).join(' or ');
}

/**
 * The destination for one (kind, scope) pair. An unknown kind throws the unsupported-kind
 * message; a scope the writer does not list throws the target's refusal, naming every scope it
 * does support (`'project' … or 'user' …`).
 */
export function destinationFor(
  table: ConfigKindTable,
  kind: ConfigKind,
  scope: ConfigScope,
  targetName: string,
): ConfigKindDestination {
  const writer = requireWriter(table, kind, targetName);
  const destination = writer.destinations[scope];
  if (destination) return destination;
  throw new SigilError(
    `${targetName} has no ${SCOPE_PHRASES[scope]} ${kind} file — install at ${scopeChoices(writer)}.`,
  );
}

/** One kind's destination at `scope`, or undefined when the writer does not list that scope. */
function destinationAt(
  writer: ConfigKindWriter,
  kind: ConfigKind,
  scope: ConfigScope,
  projectDir: string,
): ConfigScopeDestination | undefined {
  const destination = writer.destinations[scope];
  if (!destination) return undefined;
  return {
    kind,
    file: destination.file,
    root: destination.root,
    fullPath: path.join(resolveConfigRoot(destination.root, projectDir), destination.file),
    section: writer.section,
  };
}

/** One destination per requested kind the table has and whose writer supports `scope`. */
function destinationsFor(
  table: ConfigKindTable,
  scope: ConfigScope,
  kinds: ConfigKind[],
  projectDir: string,
): ConfigScopeDestination[] {
  return kinds.flatMap(kind => {
    const writer = table[kind];
    if (!writer) return [];
    const destination = destinationAt(writer, kind, scope, projectDir);
    return destination ? [destination] : [];
  });
}

/** `Target.configScopes` for a table: each scope's label, plus its destinations per kind. */
export function configScopesFrom(
  table: ConfigKindTable,
  scopeInfos: readonly Omit<ConfigScopeInfo, 'label' | 'destinations'>[],
  kinds: ConfigKind[],
  projectDir: string,
): ConfigScopeInfo[] {
  return scopeInfos.map(info => ({
    ...info,
    label: info.value,
    destinations: destinationsFor(table, info.value, kinds, projectDir),
  }));
}

/** `Target.scaffoldConfig` for a table: default the scope, then that kind's writer builds ops. */
export function scaffoldConfigFrom(
  table: ConfigKindTable,
  artifact: Artifact,
  options: ScaffoldOptions,
  targetName: string,
): ConfigMergeOp[] {
  const kind = artifact.kind as ConfigKind;
  const writer = requireWriter(table, kind, targetName);
  const scope: ConfigScope =
    options.scope ?? (artifact.frontmatter.defaultScope as ConfigScope | undefined) ?? 'project';
  destinationFor(table, kind, scope, targetName);
  return writer.buildOps(artifact, scope);
}

/** `Target.configSkipReason` for a table: delegate to the kind's writer when it has one. */
export function configSkipReasonFrom(
  table: ConfigKindTable,
  artifact: Artifact,
): string | undefined {
  return table[artifact.kind as ConfigKind]?.skipReason?.(artifact);
}
