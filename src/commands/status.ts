/**
 * `sigil status` command — show health status of artifacts installed in a consumer project.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import { loadAndValidate, detectProjectTarget } from '../cli-helpers';
import { getAllTargets, getTarget } from '../targets';
import { computeStatus, type CurrentTemplateOf } from '../manifest';
import { requireManifest } from './shared/manifest';
import { JSON_INDENT } from '../json-util';
import { isConfigKind } from '../kinds';
import type { StatusResult } from '../manifest/types';
import type { LoadedCatalog } from '../types';

export interface StatusOptions {
  projectDir: string;
  target?: string | undefined;
  catalogDir: string;
  packs: string;
  json: boolean;
}

/** Prints the `--json` machine-readable status output. */
function printStatusJson(statuses: ReturnType<typeof computeStatus>): void {
  console.log(
    JSON.stringify(
      statuses.map(s => ({
        id: s.entry.id,
        kind: s.entry.kind,
        target: s.entry.target,
        status: s.status,
        installedAt: s.entry.installedAt,
        sigilVersion: s.entry.sigilVersion,
        driftedFiles: s.driftedFiles,
        missingFiles: s.missingFiles,
        reason: s.reason,
      })),
      null,
      JSON_INDENT,
    ),
  );
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

/**
 * Scaffold-hash stub — target.scaffold is async; deep outdated detection happens in `update`.
 * Always returns null; `target` is still validated by the caller via getTarget() beforehand.
 */
function makeScaffoldHashStub(
  targetName: string,
  target: { scaffold?: unknown },
): (id: string, t: string) => Map<string, string> | null {
  return (_id, t) => (t !== targetName || !target.scaffold ? null : null);
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

/** Resolves the target + catalog into every input `computeStatus` needs, and runs it. */
function buildStatuses(
  manifest: ReturnType<typeof requireManifest>,
  rawCatalog: LoadedCatalog,
  targetName: string,
  opts: StatusOptions,
): ReturnType<typeof computeStatus> {
  const catalogIds = new Set(rawCatalog.artifacts.map(a => a.id));
  const target = getTarget(targetName);
  return computeStatus(manifest, opts.projectDir, catalogIds, {
    scaffoldHashFn: makeScaffoldHashStub(targetName, target),
    currentTemplateOf: makeCurrentTemplateOf(rawCatalog),
    retiredFor: name => getAllTargets().find(t => t.name === name)?.retiredConfigDestinations ?? [],
  });
}

export async function runStatus(opts: StatusOptions): Promise<void> {
  const { catalog: rawCatalog } = await loadAndValidate(opts.catalogDir, opts.packs);
  const targetName = opts.target ?? detectProjectTarget(opts.projectDir, { verbose: false });

  const manifest = requireManifest(opts.projectDir);

  if (manifest.entries.length === 0) {
    printNoArtifactsMessage();
    return;
  }

  const statuses = buildStatuses(manifest, rawCatalog, targetName, opts);

  if (opts.json) {
    printStatusJson(statuses);
    return;
  }

  printStatusTable(statuses);
  printStatusSummary(statuses);
}
