/**
 * Fresh-hash pre-scaffolding helpers for `computeInstallStates` — scaffolds whole-file
 * and config-kind candidates in memory to get sha256 hashes for drift/outdated detection.
 * Split out of install-state.ts to keep that file under the repo's own module-size threshold.
 *
 * @module
 */
import { sha256 } from './manifest';
import { canonicalize } from './config-merge';
import { CONFIG_KINDS } from './select';
import type { Target, ResolvedCatalog, ConfigScope } from './types';

/** Hashes each `relPath → content` scaffold output entry to `relPath → sha256`. */
function hashScaffoldOutput(freshFiles: Record<string, string>): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const [relPath, content] of Object.entries(freshFiles)) {
    hashes.set(relPath, sha256(content));
  }
  return hashes;
}

/**
 * Scaffold a single whole-file artifact and return `path → sha256` for each output file.
 * Returns null if scaffolding is not supported or fails.
 *
 * Exported so `sigil update` can share the same computation rather than
 * duplicating the inline scaffold-hash logic from cli.ts:1407-1418.
 */
export async function scaffoldHashesForArtifact(
  id: string,
  target: Target,
  catalog: ResolvedCatalog,
  projectDir: string,
): Promise<Map<string, string> | null> {
  if (!target.scaffold) return null;
  try {
    const freshFiles = await target.scaffold(id, catalog, {
      projectDir,
      overwrite: true,
      includeDeps: false,
    });
    return hashScaffoldOutput(freshFiles);
  } catch {
    return null;
  }
}

/** Splits candidate ids into whole-file vs. config-kind (mcp/hook/settings) buckets. */
export function splitCandidatesByKind(
  candidateIds: string[],
  catalog: ResolvedCatalog,
): { wholeFileIds: string[]; configKindIds: string[] } {
  const wholeFileIds = candidateIds.filter(
    id => !CONFIG_KINDS.has(catalog.byId.get(id)?.kind ?? ''),
  );
  const configKindIds = candidateIds.filter(id =>
    CONFIG_KINDS.has(catalog.byId.get(id)?.kind ?? ''),
  );
  return { wholeFileIds, configKindIds };
}

/**
 * Pre-scaffolds fresh content hashes for whole-file candidates. computeStatus's
 * scaffoldHashFn must be synchronous; pre-computing here keeps that closure a plain
 * Map lookup.
 */
async function prescaffoldWholeFileHashes(
  wholeFileIds: string[],
  target: Target,
  catalog: ResolvedCatalog,
  projectDir: string,
): Promise<Map<string, Map<string, string>>> {
  const freshByArtifact = new Map<string, Map<string, string>>();
  for (const id of wholeFileIds) {
    const hashes = await scaffoldHashesForArtifact(id, target, catalog, projectDir);
    if (hashes) freshByArtifact.set(id, hashes);
  }
  return freshByArtifact;
}

/** The target/catalog/projectDir triple shared by the config-fragment scaffold helpers below. */
export interface ScaffoldEnv {
  target: Target;
  catalog: ResolvedCatalog;
  projectDir: string;
}

/** Scaffolds one config artifact's ops and hashes each fragment; undefined on scaffold failure. */
async function scaffoldOneConfigFragmentHashes(
  id: string,
  env: ScaffoldEnv,
  scope: ConfigScope,
): Promise<string[] | undefined> {
  try {
    const ops = await env.target.scaffoldConfig!(id, env.catalog, {
      projectDir: env.projectDir,
      scope,
      includeDeps: false,
    });
    return ops.map(op => sha256(canonicalize(op.fragment)));
  } catch {
    // Scaffold failed — can't determine freshness; the id will fall through
    // to 'new' (if not in manifest) or keep the computeStatus result.
    return undefined;
  }
}

/**
 * Pre-scaffolds config-kind fragment hashes for 'outdated' detection. computeStatus's
 * scaffoldHashFn path only checks entry.files, which is always empty for config kinds —
 * this fills that gap by comparing fresh fragment sha256 vs. the recorded fragmentSha256.
 */
async function prescaffoldConfigFragmentHashes(
  configKindIds: string[],
  env: ScaffoldEnv,
  scope: ConfigScope,
): Promise<Map<string, string[]>> {
  const freshConfigHashByArtifact = new Map<string, string[]>(); // id → per-op fragment hashes
  if (!env.target.scaffoldConfig) return freshConfigHashByArtifact;

  for (const id of configKindIds) {
    const hashes = await scaffoldOneConfigFragmentHashes(id, env, scope);
    if (hashes) freshConfigHashByArtifact.set(id, hashes);
  }
  return freshConfigHashByArtifact;
}

export interface PrescaffoldResult {
  freshByArtifact: Map<string, Map<string, string>>;
  freshConfigHashByArtifact: Map<string, string[]>;
}

/** The subset of InstallStateCtx needed to run the pre-scaffold pipeline. */
export interface PrescaffoldCtx {
  candidateIds: string[];
  target: Target;
  catalog: ResolvedCatalog;
  projectDir: string;
  scope: ConfigScope;
}

/** Pre-scaffolds both whole-file and config-kind fresh hashes for the candidate set. */
export async function prescaffoldAll(ctx: PrescaffoldCtx): Promise<PrescaffoldResult> {
  const { wholeFileIds, configKindIds } = splitCandidatesByKind(ctx.candidateIds, ctx.catalog);
  const env: ScaffoldEnv = { target: ctx.target, catalog: ctx.catalog, projectDir: ctx.projectDir };
  const [freshByArtifact, freshConfigHashByArtifact] = await Promise.all([
    prescaffoldWholeFileHashes(wholeFileIds, ctx.target, ctx.catalog, ctx.projectDir),
    prescaffoldConfigFragmentHashes(configKindIds, env, ctx.scope),
  ]);
  return { freshByArtifact, freshConfigHashByArtifact };
}
