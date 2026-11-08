/**
 * Every language-specific artifact must be reachable from a pack, or `sigil add` users never see
 * it in the wizard and the plugin build drops it. A language artifact is covered when a pack lists
 * its id under `artifacts:` or is a `languages: [<lang>]` pack for its namespace.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { parsePacksConfig } from '../dist-cli/packs-config';
import { packMemberIds } from '../dist-cli/select';
import type { Pack, ResolvedCatalog } from '../dist-cli/types';
import { loadResolvedCatalog } from './helpers/catalog';

/** The test compiles to `test-compiled/`, one level below the repo root. */
const PACKS = path.resolve(__dirname, '../packs.yaml');

describe('packs.yaml language coverage', () => {
  let catalog: ResolvedCatalog;
  let packs: Pack[];

  before(async () => {
    catalog = await loadResolvedCatalog();
    packs = parsePacksConfig(fs.readFileSync(PACKS, 'utf8'), PACKS).packs;
  });

  it('should include every language artifact in at least one pack', () => {
    const covered = new Set(packs.flatMap(pack => packMemberIds(pack, catalog)));
    const missing = catalog.artifacts
      .filter(artifact => catalog.languages.has(artifact.id.split('/')[0] ?? ''))
      .map(artifact => artifact.id)
      .filter(id => !covered.has(id))
      .sort();

    assert.deepEqual(missing, [], `Language artifacts in no pack: ${missing.join(', ')}`);
  });
});
