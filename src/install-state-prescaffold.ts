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
import { renderFresh, type FreshRenderCtx } from './fresh-render';
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
 * Renders a single whole-file artifact as `update` would and returns `path → sha256` for each
 * output file. Returns null if the target cannot scaffold or the render fails.
 */
async function freshHashesForArtifact(
  id: string,
  ctx: FreshRenderCtx,
): Promise<Map<string, string> | null> {
  if (!ctx.target.scaffold) return null;
  try {
    return hashScaffoldOutput(await renderFresh(id, ctx));
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
  ctx: FreshRenderCtx,
): Promise<Map<string, Map<string, string>>> {
  const freshByArtifact = new Map<string, Map<string, string>>();
  for (const id of wholeFileIds) {
    const hashes = await freshHashesForArtifact(id, ctx);
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
  /** Every artifact id installed for this target: renders must match what `add` wrote. */
  installedIds: ReadonlySet<string>;
}

/** Pre-scaffolds both whole-file and config-kind fresh hashes for the candidate set. */
export async function prescaffoldAll(ctx: PrescaffoldCtx): Promise<PrescaffoldResult> {
  const { wholeFileIds, configKindIds } = splitCandidatesByKind(ctx.candidateIds, ctx.catalog);
  const env: ScaffoldEnv = { target: ctx.target, catalog: ctx.catalog, projectDir: ctx.projectDir };
  const [freshByArtifact, freshConfigHashByArtifact] = await Promise.all([
    prescaffoldWholeFileHashes(wholeFileIds, {
      target: ctx.target,
      resolved: ctx.catalog,
      projectDir: ctx.projectDir,
      installedIds: ctx.installedIds,
    }),
    prescaffoldConfigFragmentHashes(configKindIds, env, ctx.scope),
  ]);
  return { freshByArtifact, freshConfigHashByArtifact };
}
