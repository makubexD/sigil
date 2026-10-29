/**
 * `sigil status --json`: one row per installed entry, across every catalog the manifest records.
 *
 * @module
 */
import { JSON_INDENT } from '../json-util';
import type { CatalogSource, StatusResult } from '../manifest';
import type { CatalogResult } from './shared/catalog-groups';

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

/** Prints the `--json` machine-readable status output: every group's rows, in group order. */
export function printStatusJson(
  results: readonly CatalogResult<{ statuses: StatusResult[] }>[],
): void {
  const rows = results.flatMap(r => r.result.statuses.map(s => statusJsonRow(s, r.source)));
  console.log(JSON.stringify(rows, null, JSON_INDENT));
}
