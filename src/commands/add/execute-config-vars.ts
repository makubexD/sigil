/**
 * `sigil add` — the install values one config artifact records. A manifest entry holds only the
 * values for the names its own artifact declares, so an artifact with no `vars:` writes no key and
 * clears one a prior install left. Split out of execute-config.ts to keep that module under the
 * repo's own module-size threshold.
 *
 * @module
 */
import { pkg } from '../../cli-helpers';
import { sourceToRecord, upsertConfigEntry } from '../../manifest';
import { declaredVarNames } from '../../mcp-vars';
import type { VarValues } from '../../mcp-vars';
import type { ConfigMergeOp, ResolvedArtifact } from '../../types';
import type { InstallCtx } from './execute-config';

/** The values for `artifact`'s declared `vars:` names, and only those. */
export function declaredValues(
  artifact: Pick<ResolvedArtifact, 'frontmatter'>,
  vars: VarValues,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of declaredVarNames(artifact)) {
    const value = vars[name];
    if (value !== undefined) values[name] = value;
  }
  return values;
}

/** Records one config artifact's ops, and the values for its own declared names, in the manifest. */
export function recordConfigEntry(
  id: string,
  artifact: Pick<ResolvedArtifact, 'kind' | 'frontmatter'>,
  ops: ConfigMergeOp[],
  ctx: InstallCtx,
): void {
  const { projectDir, catalogDir, packs } = ctx.plan.opts;
  upsertConfigEntry(ctx.manifest, {
    id,
    kind: artifact.kind,
    target: ctx.targetName,
    ops,
    dependentOf: [],
    sigilVersion: pkg.version,
    now: ctx.now,
    vars: declaredValues(artifact, ctx.plan.vars),
    catalog: sourceToRecord(projectDir, catalogDir, packs),
  });
}
