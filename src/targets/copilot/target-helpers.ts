/**
 * Free-standing helpers backing the `CopilotTarget` class methods — split out of
 * index.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import type {
  ResolvedCatalog,
  FileMap,
  ConfigMergeOp,
  ConfigScope,
  ConfigKind,
  ConfigScopeDestination,
  ConfigRoot,
  ArtifactKind,
} from '../../types';
import path from 'path';
import { resolveConfigRoot } from '../../config-utils';
import { resolveCopilotConfigDestination } from './config';
import { buildCopilotInstructions } from './build-helpers';
import { emitFile, specFor } from '../emit-files';
import type { KindEmitSpec } from '../spec-types';
import { COPILOT_MCP_SERVERS_KEY } from './mcp-key';
import { portableMcpOp } from '../portable-mcp';
import { isRepoWideRule } from '../shared/repo-wide-rules';

/**
 * Copilot / VS Code MCP config scopes, ordered by documented precedence (highest → lowest).
 * Copilot has no distinct "local" MCP scope — project and local both resolve to the project's
 * .mcp.json, so only Project and User are offered for an mcp-only selection.
 */
export const CONFIG_SCOPES = [
  {
    value: 'project' as ConfigScope,
    precedence: 1,
    shared: true,
    blastRadius: 'project' as const,
    description: 'workspace — .mcp.json, git-committed',
  },
  {
    value: 'user' as ConfigScope,
    precedence: 2,
    shared: false,
    blastRadius: 'all-projects' as const,
    description: 'user — ~/.copilot/mcp-config.json, all workspaces',
  },
];

/**
 * Hook config scopes. Unlike mcp, a hook's `local` scope has its own file
 * (.github/copilot/settings.local.json), so it is a third option beside Project and User.
 */
export const HOOK_CONFIG_SCOPES = [
  {
    value: 'local' as ConfigScope,
    precedence: 1,
    shared: false,
    blastRadius: 'project' as const,
    description: 'workspace — .github/copilot/settings.local.json, not git-committed',
  },
  {
    value: 'project' as ConfigScope,
    precedence: 2,
    shared: true,
    blastRadius: 'project' as const,
    description: 'workspace — .github/hooks/sigil.json, git-committed',
  },
  {
    value: 'user' as ConfigScope,
    precedence: 3,
    shared: false,
    blastRadius: 'all-projects' as const,
    description: 'user — hooks/sigil.json under $COPILOT_HOME, all workspaces',
  },
];

/**
 * The scope list for a selection. With mcp beside a hook, Local still sends the mcp part to the
 * committed .mcp.json (mcp has no local file), so its description says so.
 */
export function copilotScopesFor(kinds: ConfigKind[]) {
  if (!kinds.includes('hook')) return CONFIG_SCOPES;
  if (!kinds.includes('mcp')) return HOOK_CONFIG_SCOPES;
  return HOOK_CONFIG_SCOPES.map(sc =>
    sc.value === 'local'
      ? {
          ...sc,
          description:
            'workspace — hooks in .github/copilot/settings.local.json (not git-committed); MCP servers still go to the git-committed .mcp.json',
        }
      : sc,
  );
}

type KindDestination = { kind: ConfigKind; file: string; root: ConfigRoot; section: string };

/** One scope's mcp destination, with the JSON key its servers sit under. */
function mcpDestination(scope: ConfigScope): KindDestination {
  return {
    kind: 'mcp',
    ...resolveCopilotConfigDestination('mcp', scope),
    section: COPILOT_MCP_SERVERS_KEY,
  };
}

/** One scope's hook destination, with the JSON key its entries sit under. */
function hookDestination(scope: ConfigScope): KindDestination {
  return {
    kind: 'hook',
    ...resolveCopilotConfigDestination('hook', scope),
    section: 'hooks',
  };
}

/** The config kinds present in `kinds`, with each kind's destination file and in-file section. */
function destinationsFor(kinds: ConfigKind[], scope: ConfigScope): KindDestination[] {
  return [
    ...(kinds.includes('mcp') ? [mcpDestination(scope)] : []),
    ...(kinds.includes('hook') ? [hookDestination(scope)] : []),
  ];
}

/** Builds one scope's config destinations (the same files scaffoldConfig writes), or []. */
export function buildScopeDestinations(
  kinds: ConfigKind[],
  scopeValue: ConfigScope,
  projectDir: string,
): ConfigScopeDestination[] {
  return destinationsFor(kinds, scopeValue).map(d => ({
    kind: d.kind,
    file: d.file,
    root: d.root,
    fullPath: path.join(resolveConfigRoot(d.root, projectDir), d.file),
    section: d.section,
  }));
}

/** Globs that mean "every file" — a rule scoped only to these belongs in the repo-wide aggregate. */
/** The per-file kinds `compile` writes; agents go only into the AGENTS.md aggregate. */
const COMPILED_FILE_KINDS: ReadonlySet<ArtifactKind> = new Set([
  'rule',
  'skill',
  'prompt',
  'workflow',
]);

/**
 * Writes every per-file artifact of a full build through its spec (src/targets/emit-files.ts):
 * scoped rules, skills with their references, prompts and workflows. Repo-wide rules go into
 * `.github/copilot-instructions.md` instead. `ctx` co-installs the whole catalog, so a skill's
 * Boundary section resolves the way an agent's does in AGENTS.md.
 */
export function buildArtifactFiles(
  catalog: ResolvedCatalog,
  specs: readonly KindEmitSpec[],
  files: FileMap,
): void {
  const ctx = { catalog, installSet: new Set(catalog.artifacts.map(a => a.id)) };
  const repoWideRules = catalog.artifacts.filter(a => a.kind === 'rule' && isRepoWideRule(a));
  if (repoWideRules.length > 0) {
    files['.github/copilot-instructions.md'] = buildCopilotInstructions(repoWideRules);
  }
  for (const artifact of catalog.artifacts) {
    if (!COMPILED_FILE_KINDS.has(artifact.kind) || repoWideRules.includes(artifact)) continue;
    const spec = specFor(specs, artifact.kind, 'scaffold');
    if (spec) emitFile(spec, artifact, ctx, files);
  }
}

type McpArtifact = NonNullable<ReturnType<ResolvedCatalog['byId']['get']>>;

/**
 * The op one mcp install needs for `scope`: the portable entry (../portable-mcp.ts, the same one
 * Claude Code writes into the shared .mcp.json) in the scope's portable file (./config.ts).
 */
export function buildMcpConfigOps(artifact: McpArtifact, scope: ConfigScope): ConfigMergeOp[] {
  return [portableMcpOp(artifact, resolveCopilotConfigDestination('mcp', scope))];
}
