/**
 * `sigil prune` — cleanup command for a consumer project's manifest: removes orphaned entries
 * (ids no longer in the bundled catalog) and reports deprecated-but-installed ones. Preview by
 * default, like `sigil sync` — bare `sigil prune` reports and writes nothing; `--apply` writes.
 *
 * Reuses the same plumbing `sigil uninstall` (uninstall.ts) already established: `removeEntries`
 * (manifest/mutate-remove.ts) for refcount-aware manifest surgery, `reverseMergeConfigEntries`
 * (uninstall-config.ts) for config-kind (hook/settings/mcp) JSON reversal, and the same
 * drifted-file protection — a locally-edited file is reported and kept unless `--force`. The
 * `--apply` write path and its render helpers live in prune-apply.ts (module-size split).
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import { loadAndValidate, detectProjectTarget } from '../cli-helpers';
import { requireManifest } from './shared/manifest';
import type { ManifestEntry } from '../manifest';
import type { Deprecated } from '../schema/index';
import { JSON_INDENT } from '../json-util';
import { applyPrune } from './prune-apply';
import { offerApply, shouldOfferApply } from './prune-guided';

export interface PruneOptions {
  projectDir: string;
  target?: string | undefined;
  catalogDir: string;
  packs: string;
  apply: boolean;
  yes: boolean;
  force: boolean;
  json: boolean;
}

export interface PruneCandidates {
  orphaned: ManifestEntry[];
  deprecated: { entry: ManifestEntry; info: Deprecated }[];
}

/** Splits one target's manifest entries into orphaned (id gone from catalog) and deprecated
 * (id present but the catalog artifact itself carries `deprecated:`). An entry can't be both —
 * `deprecated:` implies it's still a live artifact, `orphaned` means it no longer resolves. */
function findCandidates(
  manifest: { entries: ManifestEntry[] },
  targetName: string,
  catalogIds: Set<string>,
  deprecatedById: Map<string, Deprecated>,
): PruneCandidates {
  const orphaned: ManifestEntry[] = [];
  const deprecated: { entry: ManifestEntry; info: Deprecated }[] = [];
  for (const entry of manifest.entries) {
    if (entry.target !== targetName) continue;
    if (!catalogIds.has(entry.id)) {
      orphaned.push(entry);
      continue;
    }
    const info = deprecatedById.get(entry.id);
    if (info) deprecated.push({ entry, info });
  }
  return { orphaned, deprecated };
}

/** Renders the JSON report for both `--apply` and preview modes. */
function printJsonReport(candidates: PruneCandidates, applied: boolean): void {
  console.log(
    JSON.stringify(
      {
        applied,
        orphaned: candidates.orphaned.map(e => ({ id: e.id, files: e.files.map(f => f.path) })),
        deprecated: candidates.deprecated.map(({ entry, info }) => ({
          id: entry.id,
          since: info.since,
          reason: info.reason,
          supersededBy: info.supersededBy,
        })),
      },
      null,
      JSON_INDENT,
    ),
  );
}

function printOrphanedSection(orphaned: ManifestEntry[]): void {
  if (orphaned.length === 0) return;
  console.log(`${orphaned.length} orphaned artifact(s) — no longer in the bundled catalog:`);
  for (const e of orphaned) console.log(`  ✗  ${e.id}`);
  console.log('');
}

function printDeprecatedSection(deprecated: PruneCandidates['deprecated']): void {
  if (deprecated.length === 0) return;
  console.log(`${deprecated.length} deprecated artifact(s) still installed:`);
  for (const { entry, info } of deprecated) {
    const replacement = info.supersededBy ? `  →  sigil add ${info.supersededBy}` : '';
    console.log(`  !  ${entry.id}  (since ${info.since}: ${info.reason})${replacement}`);
  }
  console.log('');
}

/** The trailing "what to do next" line — differs slightly when there's nothing to --apply. */
function nextStepsLine(hasOrphaned: boolean): string {
  const deprecatedNote =
    'Deprecated-but-still-in-catalog artifacts are reported only — remove them yourself ' +
    'with `sigil uninstall` if you want to.';
  return hasOrphaned
    ? `Run \`sigil prune --apply\` to remove the orphaned artifact(s).\n(${deprecatedNote})`
    : deprecatedNote;
}

/** Prints the preview report (bare `sigil prune`, no `--apply`). */
function printPreview(candidates: PruneCandidates): void {
  const { orphaned, deprecated } = candidates;
  if (orphaned.length === 0 && deprecated.length === 0) {
    console.log('\n✓ Nothing to prune — no orphaned or deprecated artifacts installed.\n');
    return;
  }
  console.log('');
  printOrphanedSection(orphaned);
  printDeprecatedSection(deprecated);
  console.log(nextStepsLine(orphaned.length > 0));
  console.log('');
}

export async function runPrune(opts: PruneOptions): Promise<void> {
  const { catalog: rawCatalog } = await loadAndValidate(opts.catalogDir, opts.packs);
  const targetName = opts.target ?? detectProjectTarget(opts.projectDir, { verbose: false });

  const manifest = requireManifest(opts.projectDir);
  const catalogIds = new Set(rawCatalog.artifacts.map(a => a.id));
  const deprecatedById = new Map(
    rawCatalog.artifacts
      .filter(a => a.frontmatter.deprecated)
      .map(a => [a.id, a.frontmatter.deprecated as Deprecated]),
  );

  const candidates = findCandidates(manifest, targetName, catalogIds, deprecatedById);

  const ctx = { targetName, opts, printJsonReport };
  if (!opts.apply) {
    if (opts.json) printJsonReport(candidates, false);
    else printPreview(candidates);
    if (shouldOfferApply(opts, candidates)) await offerApply(manifest, candidates, ctx);
    return;
  }

  await applyPrune(manifest, candidates, ctx);
}
