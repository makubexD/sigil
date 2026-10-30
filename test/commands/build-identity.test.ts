/**
 * `sigil build` must warn when it would emit sigil's own marketplace name from a packs file that
 * is not the bundled one — a forked marketplace keeps the name `sigil` and collides with upstream
 * when both are added to Claude Code. Configuring `marketplace:` in that file silences the warning
 * and names the emitted marketplace.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runBuild } from '../../dist-cli/commands/build';
import { CATALOG, PACKS } from '../helpers/install-scenario';
import { withTempDirAsync } from '../helpers/temp-dir';

/** Runs `build --target claude` and returns what it wrote to console.warn. */
async function buildCapturingWarnings(
  root: string,
  packsFile: string,
  target = 'claude',
): Promise<string[]> {
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (msg: string) => void lines.push(msg);
  try {
    await runBuild({
      target,
      catalogDir: CATALOG,
      packs: packsFile,
      outDir: path.join(root, 'dist'),
    });
  } finally {
    console.warn = original;
  }
  return lines;
}

const marketplaceWarnings = (lines: string[]): string[] =>
  lines.filter(line => line.includes('marketplace'));

describe('build marketplace identity', () => {
  it('should not warn when building the bundled catalog and packs', async () => {
    await withTempDirAsync(async root => {
      const warnings = await buildCapturingWarnings(root, PACKS);
      assert.deepEqual(
        marketplaceWarnings(warnings),
        [],
        'no marketplace warning for sigil itself',
      );
    });
  });

  it('should warn once when a copied packs file has no marketplace block', async () => {
    await withTempDirAsync(async root => {
      const copy = path.join(root, 'packs.yaml');
      fs.copyFileSync(PACKS, copy);

      const warnings = marketplaceWarnings(await buildCapturingWarnings(root, copy));
      assert.equal(
        warnings.length,
        1,
        `expected one marketplace warning, got: ${warnings.join(' | ')}`,
      );
      assert.match(warnings[0]!, /keeps the name 'sigil'/);
      assert.match(warnings[0]!, /marketplace:/);
    });
  });

  it('should not warn for a copilot-only build, which has no marketplace', async () => {
    await withTempDirAsync(async root => {
      const copy = path.join(root, 'packs.yaml');
      fs.copyFileSync(PACKS, copy);

      const warnings = marketplaceWarnings(await buildCapturingWarnings(root, copy, 'copilot'));
      assert.deepEqual(warnings, [], 'no marketplace warning without a claude target');
    });
  });

  it('should not warn and should emit the configured name when the copy has a block', async () => {
    await withTempDirAsync(async root => {
      const copy = path.join(root, 'packs.yaml');
      fs.writeFileSync(
        copy,
        fs.readFileSync(PACKS, 'utf8') +
          '\nmarketplace:\n  name: acme-fork\n  owner: { name: Acme }\n',
      );

      const warnings = marketplaceWarnings(await buildCapturingWarnings(root, copy));
      assert.deepEqual(warnings, [], 'a configured marketplace block silences the warning');

      const marketplace = JSON.parse(
        fs.readFileSync(
          path.join(root, 'dist', 'claude', '.claude-plugin', 'marketplace.json'),
          'utf8',
        ),
      );
      assert.equal(marketplace.name, 'acme-fork', 'configured marketplace name emitted');
    });
  });
});
