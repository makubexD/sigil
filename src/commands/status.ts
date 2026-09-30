/**
 * `sigil status` command — show health status of artifacts installed in a consumer project.
 *
 * Extracted from cli.ts so it can be imported and tested without Commander.
 *
 * @module
 */
import { loadAndValidate, detectProjectTarget } from '../cli-helpers';
import { getTarget } from '../targets';
import { computeStatus } from '../manifest';
import { requireManifest } from './shared/manifest';

export interface StatusOptions {
  projectDir: string;
  target?: string | undefined;
  catalogDir: string;
  packs: string;
  json: boolean;
}

export async function runStatus(opts: StatusOptions): Promise<void> {
  const { catalog: rawCatalog } = await loadAndValidate(opts.catalogDir, opts.packs);
  const targetName = opts.target ?? detectProjectTarget(opts.projectDir, { verbose: false });

  const manifest = requireManifest(opts.projectDir);

  if (manifest.entries.length === 0) {
    console.log(
      '\n  No sigil artifacts recorded for this project.\n' +
        '  Run `sigil add` to install artifacts.',
    );
    return;
  }

  const catalogIds = new Set(rawCatalog.artifacts.map(a => a.id));
  const target = getTarget(targetName);

  // Scaffold-hash stub — target.scaffold is async; deep outdated detection happens in `update`.
  const scaffoldHashFn = (_id: string, t: string): Map<string, string> | null => {
    if (t !== targetName || !target.scaffold) return null;
    return null;
  };

  const statuses = computeStatus(manifest, opts.projectDir, catalogIds, scaffoldHashFn);

  if (opts.json) {
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
        })),
        null,
        2,
      ),
    );
    return;
  }

  const icons: Record<string, string> = {
    'up-to-date': '✓',
    outdated: '↑',
    drifted: '~',
    orphaned: '✗',
    missing: '!',
  };

  console.log('');
  for (const s of statuses) {
    const icon = icons[s.status] ?? '?';
    const depTag = s.entry.dependentOf.length ? `  (dep of ${s.entry.dependentOf.join(', ')})` : '';
    console.log(`  ${icon}  ${s.entry.id}  [${s.status}]${depTag}`);
    for (const f of s.driftedFiles) console.log(`     ~ ${f}`);
    for (const f of s.missingFiles) console.log(`     ! ${f} (missing)`);
  }

  const counts: Record<string, number> = {};
  for (const s of statuses) counts[s.status] = (counts[s.status] ?? 0) + 1;
  const summary = Object.entries(counts)
    .map(([k, n]) => `${n} ${k}`)
    .join(', ');
  console.log(`\n  ${statuses.length} artifact(s): ${summary}`);

  if (counts['outdated'] || counts['drifted'] || counts['missing']) {
    console.log('\n  Run `sigil update` to refresh outdated artifacts.');
  }
  console.log('');
}
