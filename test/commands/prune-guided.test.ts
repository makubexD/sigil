/**
 * In a terminal, `sigil prune` previews the cleanup and then offers to apply it. Without `--apply`
 * a pipe, CI or `--json` run is still a read-only preview.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runPrune } from '../../dist-cli/commands/prune';
import { loadManifest, saveManifest, sha256 } from '../../dist-cli/manifest';
import type { ManifestEntry } from '../../dist-cli/manifest/types';
import { mockClack } from '../helpers/clack-mock';
import type { MockAnswer } from '../helpers/clack-mock';
import { fakeTTY } from '../helpers/tty';
import { withTempDirAsync } from '../helpers/temp-dir';

const CATALOG = path.resolve(__dirname, '../../catalog');
const PACKS = path.resolve(__dirname, '../../packs.yaml');
const ORPHAN_FILE = '.claude/rules/gone.md';

/** A project whose manifest records an artifact the bundled catalog no longer has. */
function projectWithOrphan(dir: string): void {
  fs.mkdirSync(path.join(dir, '.claude/rules'), { recursive: true });
  fs.writeFileSync(path.join(dir, ORPHAN_FILE), 'old\n');
  const orphan = {
    id: 'gone/old-rule',
    kind: 'rule',
    target: 'claude',
    sigilVersion: '0.0.0',
    files: [{ path: ORPHAN_FILE, sha256: sha256('old\n') }],
    dependentOf: [],
    installedAt: '2026-01-01T00:00:00.000Z',
  } as ManifestEntry;
  saveManifest(dir, { manifestVersion: 2, entries: [orphan] });
}

function options(dir: string, extra: { apply?: boolean; json?: boolean } = {}) {
  return {
    projectDir: dir,
    target: 'claude',
    catalogDir: CATALOG,
    packs: PACKS,
    apply: false,
    yes: false,
    force: false,
    json: false,
    ...extra,
  };
}

async function inTerminal(
  dir: string,
  answers: MockAnswer[],
  extra: Parameters<typeof options>[1] = {},
): Promise<void> {
  const restoreTTY = fakeTTY();
  const restore = mockClack(answers);
  try {
    await runPrune(options(dir, extra));
  } finally {
    restore();
    restoreTTY();
  }
}

const orphanInstalled = (dir: string): boolean =>
  loadManifest(dir).entries.some(e => e.id === 'gone/old-rule');

describe('runPrune in a terminal', () => {
  it('should remove the orphaned artifact after the user agrees', async () => {
    await withTempDirAsync(async dir => {
      projectWithOrphan(dir);
      await inTerminal(dir, [true]);
      assert.equal(orphanInstalled(dir), false);
      assert.equal(fs.existsSync(path.join(dir, ORPHAN_FILE)), false);
    });
  });

  it('should keep everything when the user declines', async () => {
    await withTempDirAsync(async dir => {
      projectWithOrphan(dir);
      await inTerminal(dir, [false]);
      assert.equal(orphanInstalled(dir), true);
      assert.equal(fs.existsSync(path.join(dir, ORPHAN_FILE)), true);
    });
  });

  it('should keep everything when the user presses Ctrl+C', async () => {
    await withTempDirAsync(async dir => {
      projectWithOrphan(dir);
      await inTerminal(dir, [Symbol('cancel')]);
      assert.equal(orphanInstalled(dir), true);
    });
  });

  it('should not ask when there is nothing to prune', async () => {
    await withTempDirAsync(async dir => {
      fs.mkdirSync(path.join(dir, '.claude'));
      saveManifest(dir, { manifestVersion: 2, entries: [] });
      await inTerminal(dir, []); // an empty queue throws if any prompt appears
    });
  });

  it('should stay a read-only preview for --json', async () => {
    await withTempDirAsync(async dir => {
      projectWithOrphan(dir);
      await inTerminal(dir, [], { json: true });
      assert.equal(orphanInstalled(dir), true);
    });
  });
});

describe('runPrune outside a terminal', () => {
  it('should only preview, as before', async () => {
    await withTempDirAsync(async dir => {
      projectWithOrphan(dir);
      await runPrune(options(dir));
      assert.equal(orphanInstalled(dir), true);
    });
  });
});
