/**
 * Tests for src/manifest/catalog-source.ts — recording where an entry was installed from.
 *
 * A manifest entry from a non-bundled catalog carries `catalog: { dir, packs }`, both relative
 * to the project folder, so `status` / `update` / `prune` can use that catalog instead of
 * reporting the entry orphaned against the bundled one.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  sourceToRecord,
  groupBySource,
  assertReachable,
  type CatalogSource,
} from '../dist-cli/manifest/catalog-source';
import { resolveDefault } from '../dist-cli/cli-helpers';
import { SigilError } from '../dist-cli/errors';
import type { ManifestEntry } from '../dist-cli/manifest/types';

/** A manifest entry fixture; `catalog` is the field this module records. */
type Entry = ManifestEntry & { catalog?: CatalogSource | undefined };

/** A minimal entry, optionally installed from a recorded catalog source. */
function entry(id: string, catalog?: CatalogSource | undefined): Entry {
  const base: Entry = {
    id,
    kind: 'rule',
    target: 'claude',
    sigilVersion: '0.0.0',
    files: [],
    dependentOf: [],
    installedAt: '2026-10-28T00:00:00Z',
  };
  return catalog === undefined ? base : { ...base, catalog };
}

const TEAM: CatalogSource = { dir: '../team', packs: '../team/packs.yaml' };

/** The bundled catalog options, as commander fills them. */
const bundledOpts = {
  catalogDir: resolveDefault('catalog'),
  packs: resolveDefault('packs.yaml'),
};

describe('catalog source', () => {
  it('sourceToRecord: a bundled install records nothing', () => {
    assert.equal(
      sourceToRecord('/p', resolveDefault('catalog'), resolveDefault('packs.yaml')),
      undefined,
    );
  });

  it('sourceToRecord: a catalog beside the project is recorded relative to it', () => {
    assert.deepEqual(sourceToRecord('/w/p', '/w/team', '/w/team/packs.yaml'), TEAM);
  });

  it('sourceToRecord: a catalog inside the project is recorded relative to it', () => {
    assert.deepEqual(sourceToRecord('/w/p', '/w/p/catalog-fork', '/w/p/catalog-fork/packs.yaml'), {
      dir: 'catalog-fork',
      packs: 'catalog-fork/packs.yaml',
    });
  });

  it('groupBySource: one group per recorded source, bundled first', () => {
    const projectDir = '/w/p';
    const entries: Entry[] = [
      entry('shared/clean-code'),
      entry('shared/code-reviewer'),
      entry('shared/team-rule', TEAM),
    ];

    const groups = groupBySource(entries, { projectDir, ...bundledOpts });

    assert.equal(groups.length, 2);
    const [bundled, team] = groups;
    assert.equal(bundled!.source, undefined, 'the bundled group has no recorded source');
    assert.equal(bundled!.catalogDir, resolveDefault('catalog'));
    assert.deepEqual(
      bundled!.entries.map((e: ManifestEntry) => e.id),
      ['shared/clean-code', 'shared/code-reviewer'],
    );
    assert.deepEqual(team!.source, TEAM);
    assert.deepEqual(
      team!.entries.map((e: ManifestEntry) => e.id),
      ['shared/team-rule'],
    );
    assert.equal(team!.catalogDir, path.resolve(projectDir, '../team'), 'dir resolved for reads');
    assert.equal(team!.packs, path.resolve(projectDir, '../team/packs.yaml'));
  });

  it('groupBySource: an explicit --catalog-dir wins and judges every entry against it', () => {
    const projectDir = '/w/p';
    const entries: Entry[] = [
      entry('shared/clean-code'),
      entry('shared/code-reviewer'),
      entry('shared/team-rule', TEAM),
    ];

    const groups = groupBySource(entries, {
      projectDir,
      catalogDir: '/x/other',
      packs: '/x/other/packs.yaml',
    });

    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.catalogDir, '/x/other');
    assert.equal(groups[0]!.entries.length, 3);
  });

  it('assertReachable: a recorded catalog that is gone throws before anything is read', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-catalog-source-'));
    try {
      // No ../team beside the temp project folder.
      const groups = groupBySource([entry('shared/team-rule', TEAM)], {
        projectDir,
        ...bundledOpts,
      });

      assert.throws(
        () => assertReachable(groups, projectDir),
        (err: unknown) => {
          assert.ok(err instanceof SigilError, 'throws SigilError');
          assert.match(err.message, /\.\.\/team/);
          assert.match(err.message, /1 artifact/);
          assert.match(err.hint ?? '', /--catalog-dir/);
          return true;
        },
      );
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
  it('groupBySource: a malformed recorded catalog throws, naming the entry', () => {
    for (const bad of [{ dir: 5, packs: 'p' }, { dir: '', packs: 'p' }, 'team', null]) {
      const broken = { ...entry('shared/team-rule'), catalog: bad } as unknown as Entry;
      assert.throws(
        () => groupBySource([broken], { projectDir: '/w/p', ...bundledOpts }),
        (err: unknown) => {
          assert.ok(err instanceof SigilError, `${JSON.stringify(bad)} throws SigilError`);
          assert.match(err.message, /shared\/team-rule/);
          assert.match(err.hint ?? '', /--catalog-dir/);
          return true;
        },
      );
    }
  });

  it('groupBySource: an explicit --catalog-dir never reads the recorded catalog', () => {
    const broken = { ...entry('shared/team-rule'), catalog: 'team' } as unknown as Entry;
    const groups = groupBySource([broken], {
      projectDir: '/w/p',
      catalogDir: '/x/other',
      packs: '/x/other/packs.yaml',
    });
    assert.equal(groups[0]!.entries.length, 1);
  });
});
