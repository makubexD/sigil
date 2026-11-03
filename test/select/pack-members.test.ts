/**
 * Tests for packMemberIds — the pack expansion `sigil add pack:<name>` uses, shared with
 * resolveSelection's `pack:` selector.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { packMemberIds, resolveSelection } from '../../dist-cli/select/index';
import { parsePacksConfig } from '../../dist-cli/packs-config';
import { loadResolvedCatalog } from '../helpers/catalog';
import { PACKS } from '../helpers/install-scenario';
import type { ResolvedCatalog } from '../../dist-cli/types';

const packs = parsePacksConfig(fs.readFileSync(PACKS, 'utf8'), PACKS).packs;

describe('packMemberIds', () => {
  let catalog: ResolvedCatalog;

  beforeEach(async () => {
    catalog = await loadResolvedCatalog();
  });

  it('should expand a languages pack to exactly the artifacts of that language', () => {
    const pack = packs.find(p => p.name === 'dotnet-tooling');
    assert.ok(pack, 'packs.yaml must define dotnet-tooling');

    const ids = packMemberIds(pack, catalog);
    const expected = catalog.artifacts
      .filter(a => a.frontmatter.language === 'csharp')
      .map(a => a.id);

    assert.ok(ids.length > 0, 'dotnet-tooling must have members');
    assert.deepEqual(ids, expected);
  });

  it('should include a pluginExclude id that add still installs', () => {
    const pack = packs.find(p => p.name === 'essentials');
    assert.ok(pack, 'packs.yaml must define essentials');

    assert.ok(
      packMemberIds(pack, catalog).includes('shared/author-artifact'),
      'essentials lists shared/author-artifact under pluginExclude, but add installs it',
    );
  });

  it('should return the same ids as resolveSelection for the same pack', () => {
    const pack = packs.find(p => p.name === 'essentials');
    assert.ok(pack, 'packs.yaml must define essentials');

    const { ids } = resolveSelection({
      selectors: ['pack:essentials'],
      filters: {},
      catalog,
      packs,
    });

    assert.deepEqual(new Set(packMemberIds(pack, catalog)), new Set(ids));
  });

  it('should keep the unknown-pack error for resolveSelection', () => {
    assert.throws(
      () =>
        resolveSelection({
          selectors: ['pack:no-such-pack'],
          filters: {},
          catalog,
          packs,
        }),
      /Unknown pack 'no-such-pack'/,
    );
  });
});
