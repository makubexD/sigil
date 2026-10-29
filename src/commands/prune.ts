/**
 * `sigil prune` — cleanup command for a consumer project's manifest: removes orphaned entries
 * (ids no longer in the catalog each was installed from) and dependency copies every installed parent already
 * carries inline; reports deprecated-but-installed ones and inline copies that may have been picked. Preview by
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
import { detectProjectTarget } from '../cli-helpers';
import { getTarget } from '../targets/index';
import { inlinedDependencies } from './shared/inlined-deps';
import { requireManifest } from './shared/manifest';
import { perCatalog, printSourceLines } from './shared/catalog-groups';
import type { Manifest, ManifestEntry } from '../manifest';
import type { LoadedCatalog } from '../types';
import type { Deprecated } from '../schema/index';
import { JSON_INDENT } from '../json-util';
import { applyPrune, removableEntries } from './prune-apply';
import type { ApplyPruneCtx } from './prune-apply';
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
  /** Dependencies installed as files that every installed parent now carries inline. */
  inlined: ManifestEntry[];
  /** Inlined copies from a manifest too old to say they weren't picked: reported, never removed. */
  inlinedUnconfirmed: ManifestEntry[];
  deprecated: { entry: ManifestEntry; info: Deprecated }[];
}

/** The entries whose catalog artifact carries `deprecated:`, with that info. */
function deprecatedEntries(
  live: ManifestEntry[],
  deprecatedById: Map<string, Deprecated>,
): PruneCandidates['deprecated'] {
  return live.flatMap(entry => {
    const info = deprecatedById.get(entry.id);
    return info ? [{ entry, info }] : [];
  });
}

/** Splits one target's manifest entries into orphaned (id gone from catalog), inlined (see
 * shared/inlined-deps.ts) and deprecated (id present but the catalog artifact itself carries
 * `deprecated:`). Orphaned excludes the other two — `deprecated:` implies it's still a live
 * artifact, `orphaned` means it no longer resolves. */
function findCandidates(
  manifest: { entries: ManifestEntry[] },
  targetName: string,
  catalog: LoadedCatalog,
  deprecatedById: Map<string, Deprecated>,
): PruneCandidates {
  const catalogIds = new Set(catalog.byId.keys());
  const own = manifest.entries.filter(e => e.target === targetName);
  const live = own.filter(e => catalogIds.has(e.id));
  const orphaned = own.filter(e => !catalogIds.has(e.id));
  const inlined = inlinedDependencies(live, getTarget(targetName), catalog);
  const deprecated = deprecatedEntries(live, deprecatedById);
  return {
    orphaned,
    inlined: inlined.removable,
    inlinedUnconfirmed: inlined.unconfirmed,
    deprecated,
  };
}

/** One entry's id and installed paths, as the JSON report lists it. */
function entryFiles(e: ManifestEntry): { id: string; files: string[] } {
  return { id: e.id, files: e.files.map(f => f.path) };
}

/** Renders the JSON report for both `--apply` and preview modes. */
function printJsonReport(candidates: PruneCandidates, applied: boolean): void {
  console.log(
    JSON.stringify(
      {
        applied,
        orphaned: candidates.orphaned.map(entryFiles),
        inlined: candidates.inlined.map(entryFiles),
        inlinedUnconfirmed: candidates.inlinedUnconfirmed.map(entryFiles),
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
  console.log(
    `${orphaned.length} orphaned artifact(s) — no longer in the catalog it was installed from:`,
  );
  for (const e of orphaned) console.log(`  ✗  ${e.id}`);
  console.log('');
}

function printInlinedSection(inlined: ManifestEntry[]): void {
  if (inlined.length === 0) return;
  console.log(
    `${inlined.length} artifact(s) also carried inline by the skill that uses them (loaded twice):`,
  );
  for (const e of inlined) console.log(`  ✗  ${e.id}  (in ${e.dependentOf.join(', ')})`);
  console.log('');
}

function printUnconfirmedSection(unconfirmed: ManifestEntry[]): void {
  if (unconfirmed.length === 0) return;
  console.log(
    `${unconfirmed.length} artifact(s) also carried inline, kept because this install predates ` +
      'sigil recording your picks — remove one yourself with `sigil uninstall <id>` if you did not pick it:',
  );
  for (const e of unconfirmed) console.log(`  !  ${e.id}  (in ${e.dependentOf.join(', ')})`);
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
function nextStepsLine(hasRemovable: boolean, askingNow: boolean): string {
  const deprecatedNote =
    'Deprecated-but-still-in-catalog artifacts are reported only — remove them yourself ' +
    'with `sigil uninstall` if you want to.';
  // A terminal is asked right after the preview, so "run --apply" would repeat the question.
  if (hasRemovable && askingNow) return `(${deprecatedNote})`;
  return hasRemovable
    ? `Run \`sigil prune --apply\` to remove the artifact(s) listed above.\n(${deprecatedNote})`
    : deprecatedNote;
}

/** Prints the preview report (bare `sigil prune`, no `--apply`). */
function printPreview(candidates: PruneCandidates, askingNow: boolean): void {
  const { orphaned, inlined, inlinedUnconfirmed, deprecated } = candidates;
  const removable = removableEntries(candidates).length;
  if (removable === 0 && deprecated.length === 0 && inlinedUnconfirmed.length === 0) {
    console.log('\n✓ Nothing to prune — no orphaned, inlined or deprecated artifacts installed.\n');
    return;
  }
  console.log('');
  printOrphanedSection(orphaned);
  printInlinedSection(inlined);
  printUnconfirmedSection(inlinedUnconfirmed);
  printDeprecatedSection(deprecated);
  console.log(nextStepsLine(removable > 0, askingNow));
  console.log('');
}

/** The preview (or its JSON), then, in a terminal with something to remove, the offer to apply it. */
async function previewAndOffer(
  manifest: ReturnType<typeof requireManifest>,
  candidates: PruneCandidates,
  ctx: ApplyPruneCtx,
): Promise<void> {
  const offering = shouldOfferApply(ctx.opts, candidates);
  if (ctx.opts.json) printJsonReport(candidates, false);
  else printPreview(candidates, offering);
  if (offering) await offerApply(manifest, candidates, ctx);
}

/** Every catalog artifact carrying `deprecated:`, by id. */
function deprecatedById(catalog: LoadedCatalog): Map<string, Deprecated> {
  return new Map(
    catalog.artifacts
      .filter(a => a.frontmatter.deprecated)
      .map(a => [a.id, a.frontmatter.deprecated as Deprecated]),
  );
}

/** One group's candidates, found by judging its entries against its own catalog. */
function groupCandidates(
  view: Manifest,
  targetName: string,
  catalog: LoadedCatalog,
): PruneCandidates {
  return findCandidates(view, targetName, catalog, deprecatedById(catalog));
}

/** The per-group reports as the one report the command prints. */
function mergeCandidates(parts: readonly PruneCandidates[]): PruneCandidates {
  return {
    orphaned: parts.flatMap(p => p.orphaned),
    inlined: parts.flatMap(p => p.inlined),
    inlinedUnconfirmed: parts.flatMap(p => p.inlinedUnconfirmed),
    deprecated: parts.flatMap(p => p.deprecated),
  };
}

export async function runPrune(opts: PruneOptions): Promise<void> {
  const targetName = opts.target ?? detectProjectTarget(opts.projectDir, { verbose: false });
  const manifest = requireManifest(opts.projectDir);

  const results = await perCatalog(manifest, opts, (catalog, view) =>
    groupCandidates(view, targetName, catalog),
  );

  if (!opts.json) printSourceLines(results);
  const candidates = mergeCandidates(results.map(r => r.result));

  const ctx = { targetName, opts, printJsonReport };
  if (opts.apply) await applyPrune(manifest, candidates, ctx);
  else await previewAndOffer(manifest, candidates, ctx);
}
