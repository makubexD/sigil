/**
 * `sigil status` command — show health status of artifacts installed in a consumer project.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import { detectProjectTarget } from '../cli-helpers';
import { getAllTargets, getTarget, retiredConfigDestinationsOf } from '../targets';
import { duplicateLoads } from './status-overlaps';
import { computeStatus, type CurrentTemplateOf } from '../manifest';
import { resolveCatalog } from '../resolve';
import { applyProjectOverlays } from '../overlays';
import { entryKey, staleEntries, statusHooks } from '../freshness';
import { requireManifest } from './shared/manifest';
import { perCatalog, printSourceLine } from './shared/catalog-groups';
import { JSON_INDENT } from '../json-util';
import { isConfigKind } from '../kinds';
import type { Freshness } from '../freshness';
import type { CatalogSource, StatusResult } from '../manifest';
import type { LoadedCatalog } from '../types';

export interface StatusOptions {
  projectDir: string;
  target?: string | undefined;
  catalogDir: string;
  packs: string;
  json: boolean;
}

/** One entry's row in the `--json` output, tagged with its catalog when it was not the bundled one. */
function statusJsonRow(s: StatusResult, catalog?: CatalogSource): Record<string, unknown> {
  return {
    id: s.entry.id,
    kind: s.entry.kind,
    target: s.entry.target,
    status: s.status,
    catalog,
    installedAt: s.entry.installedAt,
    sigilVersion: s.entry.sigilVersion,
    driftedFiles: s.driftedFiles,
    missingFiles: s.missingFiles,
    reason: s.reason,
    // Each is absent unless non-empty, so JSON.stringify leaves it out.
    retiredFiles: s.retiredFiles,
    renderError: s.renderError,
    newDependencies: s.newDependencies,
  };
}

/** Prints the `--json` machine-readable status output. */
function printStatusJson(results: Awaited<ReturnType<typeof perCatalogStatus>>): void {
  const rows = results.flatMap(r => r.result.statuses.map(s => statusJsonRow(s, r.source)));
  console.log(JSON.stringify(rows, null, JSON_INDENT));
}

/** Icon per status value, used by the human-readable table. */
const STATUS_ICONS: Record<string, string> = {
  'up-to-date': '✓',
  outdated: '↑',
  drifted: '~',
  orphaned: '✗',
  missing: '!',
};

/** Plain words for each status in the human-readable output; `--json` keeps the machine names. */
const STATUS_WORDS: Record<string, string> = {
  'up-to-date': 'up to date',
  outdated: 'newer version available',
  drifted: 'edited by you',
  orphaned: 'no longer in the catalog',
  missing: 'file deleted',
};

const statusWord = (status: string): string => STATUS_WORDS[status] ?? status;

/** Prints the human-readable per-artifact status table. */
function printStatusTable(statuses: ReturnType<typeof computeStatus>): void {
  console.log('');
  for (const s of statuses) {
    const icon = STATUS_ICONS[s.status] ?? '?';
    const depTag = s.entry.dependentOf.length ? `  (dep of ${s.entry.dependentOf.join(', ')})` : '';
    console.log(`  ${icon}  ${s.entry.id}  [${statusWord(s.status)}]${depTag}`);
    if (s.reason) console.log(`     ${s.reason}`);
    for (const f of s.driftedFiles) console.log(`     ~ ${f}`);
    for (const f of s.missingFiles) console.log(`     ! ${f} (missing)`);
    printScanNotes(s);
  }
}

/** The notes under an entry for what the freshness scan found beyond its status. */
function printScanNotes(s: StatusResult): void {
  if (s.renderError) console.log(`     ⚠ render failed: ${s.renderError}`);
  for (const f of s.retiredFiles ?? []) {
    console.log(`     ⚠ ${f}: retired, no replacement in the catalog`);
  }
  if (s.newDependencies) {
    console.log(`     + update would also install: ${s.newDependencies.join(', ')}`);
  }
}

/**
 * The command that fixes each problem `status` found. They differ on purpose: `sigil update`
 * re-renders files that exist and re-merges config fragments, but it does not recreate a deleted
 * whole-file artifact (it reports "already up-to-date"); `sigil add` does.
 */
export function statusNextSteps(statuses: readonly StatusResult[]): string[] {
  const has = (status: StatusResult['status']): boolean => statuses.some(s => s.status === status);
  const steps = statuses.filter(s => s.status === 'missing').map(restoreStep);
  if (has('outdated')) steps.push('Refresh outdated artifacts: sigil update');
  if (has('drifted')) {
    steps.push(
      'Files you edited are kept. To replace them with the catalog version: sigil update --force',
    );
  }
  if (has('orphaned')) {
    steps.push(
      'Artifacts no longer in the catalog can be removed. Preview the cleanup: sigil prune',
    );
  }
  return [...steps, ...scanSteps(statuses)];
}

/** The steps for what the freshness scan found: failed renders, retired files, new dependencies. */
function scanSteps(statuses: readonly StatusResult[]): string[] {
  const steps: string[] = [];
  if (statuses.some(s => s.renderError)) {
    steps.push('Fix the catalog error behind a failed render, then check it: sigil status');
  }
  for (const { entry } of statuses.filter(s => s.retiredFiles)) {
    steps.push(
      `Remove ${entry.id}, whose config file was retired: sigil uninstall ${entry.id} --target ${entry.target}`,
    );
  }
  if (statuses.some(s => s.newDependencies)) steps.push('Install new dependencies: sigil update');
  return steps;
}

/** How to bring one missing artifact back: config fragments via `update`, whole files via `add`. */
function restoreStep({ entry }: StatusResult): string {
  return isConfigKind(entry.kind)
    ? `Restore ${entry.id}: sigil update ${entry.id} --target ${entry.target}`
    : `Restore ${entry.id}: sigil add ${entry.kind}:${entry.id} --target ${entry.target} --yes`;
}

/** Prints the trailing summary line and what to run next. */
function printStatusSummary(statuses: ReturnType<typeof computeStatus>): void {
  const counts: Record<string, number> = {};
  for (const s of statuses) counts[s.status] = (counts[s.status] ?? 0) + 1;
  const summary = Object.entries(counts)
    .map(([k, n]) => `${n} ${statusWord(k)}`)
    .join(', ');
  console.log(`\n  ${statuses.length} artifact(s): ${summary}`);

  const steps = statusNextSteps(statuses);
  if (steps.length > 0) {
    console.log('\n  Next:');
    for (const step of steps) console.log(`    ${step}`);
  }
  console.log('');
}

/** Prints the "no artifacts recorded" message for an empty manifest. */
function printNoArtifactsMessage(): void {
  console.log(
    '\n  No sigil artifacts recorded for this project.\n' +
      '  Run `sigil add` to install artifacts.',
  );
}

/** Looks up an artifact's current `template:`/`revision:` pair straight from catalog frontmatter. */
function makeCurrentTemplateOf(catalog: LoadedCatalog): CurrentTemplateOf {
  return id => {
    const artifact = catalog.byId.get(id);
    const templateId = artifact?.frontmatter.template as string | undefined;
    if (!templateId) return undefined;
    const template = catalog.byId.get(templateId);
    const revision = template?.frontmatter.revision;
    return typeof revision === 'number' ? { id: templateId, revision } : undefined;
  };
}

/** What `update` would change, over the catalog with project overlays (as `add` and `update` see it). */
function scanFreshness(
  manifest: ReturnType<typeof requireManifest>,
  rawCatalog: LoadedCatalog,
  opts: StatusOptions,
): Promise<Freshness> {
  const { resolved, refused } = applyProjectOverlays(resolveCatalog(rawCatalog), opts.projectDir);
  return staleEntries(manifest, {
    resolved,
    projectDir: opts.projectDir,
    targetOf: name => getAllTargets().find(t => t.name === name),
    refused,
    retiredFor: retiredConfigDestinationsOf,
  });
}

/**
 * Runs `computeStatus` with every input it needs. Outdated means `update` would rewrite the entry.
 * Also returns the scan, whose failed renders and new dependencies the output reports.
 */
async function buildStatuses(
  manifest: ReturnType<typeof requireManifest>,
  rawCatalog: LoadedCatalog,
  opts: StatusOptions,
): Promise<{ statuses: ReturnType<typeof computeStatus>; fresh: Freshness }> {
  const catalogIds = new Set(rawCatalog.artifacts.map(a => a.id));
  const fresh = await scanFreshness(manifest, rawCatalog, opts);
  const statuses = computeStatus(manifest, opts.projectDir, catalogIds, {
    currentTemplateOf: makeCurrentTemplateOf(rawCatalog),
    retiredFor: retiredConfigDestinationsOf,
    ...statusHooks(fresh),
  });
  return { statuses: statuses.map(s => withScanFindings(s, fresh)), fresh };
}

/** `s` with the scan's failed render and new dependencies for its entry, when there are any. */
function withScanFindings(s: StatusResult, fresh: Freshness): StatusResult {
  const key = entryKey(s.entry);
  const renderError = fresh.failed.get(key);
  const newDependencies = fresh.newDependencies.get(key);
  return {
    ...s,
    ...(renderError ? { renderError } : {}),
    ...(newDependencies ? { newDependencies: [...newDependencies].sort() } : {}),
  };
}

/** Runs the per-catalog status logic once per catalog the manifest records. */
function perCatalogStatus(manifest: ReturnType<typeof requireManifest>, opts: StatusOptions) {
  return perCatalog(manifest, opts, (catalog, view) => buildStatuses(view, catalog, opts));
}

export async function runStatus(opts: StatusOptions): Promise<void> {
  // An unknown --target still fails here, before any catalog is read.
  getTarget(opts.target ?? detectProjectTarget(opts.projectDir, { verbose: false }));

  const manifest = requireManifest(opts.projectDir);

  if (manifest.entries.length === 0) {
    printNoArtifactsMessage();
    return;
  }

  const results = await perCatalogStatus(manifest, opts);

  if (opts.json) return printStatusJson(results);

  for (const r of results) {
    printSourceLine(r.source);
    printStatusTable(r.result.statuses);
  }
  printStatusSummary(results.flatMap(r => r.result.statuses));
  for (const note of duplicateLoads(manifest.entries, getAllTargets())) console.log(`  ℹ  ${note}`);
}
