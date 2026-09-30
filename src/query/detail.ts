/**
 * getArtifactDetail + formatDetailText — support for the `sigil get` command.
 * Pure functions, no I/O.
 */
import type { ResolvedArtifact, LoadedCatalog, Target } from '../types';
import { artifactTargetsPlatform } from '../select';
import { hasUsesClosure } from '../kinds';
import { supportsKind } from '../targets/capabilities';

export interface ArtifactDetail {
  id: string;
  kind: string;
  title: string;
  description: string;
  tags: string[];
  language: string | undefined;
  platforms: string[] | undefined; // undefined = all supporting targets
  filePath: string;

  // Kind-specific fields (undefined when not applicable)
  appliesTo: string[] | undefined;
  appliesToRationale: string | undefined;
  severity: string | undefined;
  extends: string[] | undefined;
  uses:
    | {
        rules: string[];
        agents: string[];
      }
    | undefined;
  tools: string[] | undefined;
  disallowedTools: string[] | undefined;
  claude:
    | {
        model?: string;
        effort?: string;
        maxTurns?: number;
        isolation?: string;
      }
    | undefined;
  args: Array<{ name: string; description?: string; required?: boolean }> | undefined;
  steps: Array<{ ref: string; description?: string }> | undefined;

  // Resolved dependency tree (from resolve phase)
  resolvedRules: string[]; // IDs only
  resolvedAgentIds: string[];

  // Reverse dependents (skills that use this artifact via `uses:`)
  reverseDependents: string[];

  // Which registered targets will emit this artifact
  targetPlatforms: string[];
}

/** Scans the catalog for skills whose `uses.rules`/`uses.agents` reference `artifactId`. */
function computeReverseDependents(artifactId: string, rawCatalog: LoadedCatalog): string[] {
  const reverseDependents: string[] = [];
  for (const a of rawCatalog.artifacts) {
    if (!hasUsesClosure(a.kind)) continue;
    const uses = a.frontmatter.uses as { rules?: string[]; agents?: string[] } | undefined;
    const usesRule = (uses?.rules ?? []).includes(artifactId);
    const usesAgent = (uses?.agents ?? []).includes(artifactId);
    if (usesRule || usesAgent) reverseDependents.push(a.id);
  }
  return reverseDependents;
}

/** Determines which registered targets will actually emit this artifact. */
function computeTargetPlatforms(artifact: ResolvedArtifact, targets: Target[]): string[] {
  return targets
    .filter(t => {
      if (!supportsKind(t, artifact.kind)) return false;
      return artifactTargetsPlatform(artifact, t.name);
    })
    .map(t => t.name);
}

type CommonDetailFields = Pick<
  ArtifactDetail,
  'id' | 'kind' | 'title' | 'description' | 'tags' | 'language' | 'platforms' | 'filePath'
>;

/** Builds the fields common to every kind (title, description, tags, platforms, etc.). */
function buildCommonDetailFields(
  artifact: ResolvedArtifact,
  fm: Record<string, unknown>,
): CommonDetailFields {
  return {
    id: artifact.id,
    kind: artifact.kind,
    title: (fm.title as string | undefined) ?? '',
    description: (fm.description as string | undefined) ?? '',
    tags: (fm.tags as string[] | undefined) ?? [],
    language: fm.language as string | undefined,
    platforms: fm.platforms as string[] | undefined,
    filePath: artifact.filePath,
  };
}

type KindSpecificDetailFields = Pick<
  ArtifactDetail,
  | 'appliesTo'
  | 'appliesToRationale'
  | 'severity'
  | 'extends'
  | 'uses'
  | 'tools'
  | 'disallowedTools'
  | 'claude'
  | 'args'
  | 'steps'
>;

/** Builds the kind-specific fields (appliesTo, uses, tools, claude, args, steps). */
function buildKindSpecificDetailFields(fm: Record<string, unknown>): KindSpecificDetailFields {
  return {
    appliesTo: fm.appliesTo as string[] | undefined,
    appliesToRationale: fm.appliesToRationale as string | undefined,
    severity: fm.severity as string | undefined,
    extends: fm.extends as string[] | undefined,
    uses: fm.uses as ArtifactDetail['uses'] | undefined,
    tools: fm.tools as string[] | undefined,
    disallowedTools: fm.disallowedTools as string[] | undefined,
    claude: fm.claude as ArtifactDetail['claude'] | undefined,
    args: fm.args as ArtifactDetail['args'] | undefined,
    steps: fm.steps as ArtifactDetail['steps'] | undefined,
  };
}

/**
 * Assemble a full detail record for a single artifact.
 *
 * @param artifact   The resolved artifact from the catalog.
 * @param rawCatalog The raw loaded catalog (for reverse-dep scan).
 * @param targets    All registered targets (for targetPlatforms + platforms label).
 */
export function getArtifactDetail(
  artifact: ResolvedArtifact,
  rawCatalog: LoadedCatalog,
  targets: Target[],
): ArtifactDetail {
  const fm = artifact.frontmatter;

  return {
    ...buildCommonDetailFields(artifact, fm),
    ...buildKindSpecificDetailFields(fm),
    resolvedRules: (artifact.resolvedRules ?? []).map(r => r.id),
    resolvedAgentIds: artifact.resolvedAgentIds ?? [],
    reverseDependents: computeReverseDependents(artifact.id, rawCatalog),
    targetPlatforms: computeTargetPlatforms(artifact, targets),
  };
}
