/**
 * `sigil status` uses plain words in its table and summary; `--json` keeps the machine names.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runStatus, statusNextSteps } from '../../dist-cli/commands/status';
import { saveManifest, sha256 } from '../../dist-cli/manifest';
import type { ManifestEntry } from '../../dist-cli/manifest/types';
import { withTempDirAsync } from '../helpers/temp-dir';

const CATALOG = path.resolve(__dirname, '../../catalog');
const PACKS = path.resolve(__dirname, '../../packs.yaml');

function rule(dir: string, id: string, relative: string, onDisk: string, recorded: string) {
  fs.mkdirSync(path.join(dir, path.dirname(relative)), { recursive: true });
  fs.writeFileSync(path.join(dir, relative), onDisk);
  return {
    id,
    kind: 'rule',
    target: 'claude',
    sigilVersion: '0.0.0',
    files: [{ path: relative, sha256: sha256(recorded) }],
    dependentOf: [],
    installedAt: '2026-01-01T00:00:00.000Z',
  } as ManifestEntry;
}

async function statusText(json: boolean): Promise<string> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.join(' '));
  try {
    await withTempDirAsync(async dir => {
      saveManifest(dir, {
        manifestVersion: 2,
        entries: [
          rule(dir, 'shared/git', '.claude/rules/git.md', 'my edit', 'original'),
          rule(dir, 'gone/old', '.claude/rules/old.md', 'x', 'x'),
        ],
      });
      await runStatus({
        projectDir: dir,
        target: 'claude',
        catalogDir: CATALOG,
        packs: PACKS,
        json,
      });
    });
  } finally {
    console.log = original;
  }
  return lines.join(' | ');
}

describe('sigil status wording', () => {
  it('should use plain words in the table and the summary', async () => {
    const out = await statusText(false);
    assert.match(out, /\[edited by you\]/);
    assert.match(out, /\[no longer in the catalog\]/);
    assert.doesNotMatch(out, /\[drifted\]|\[orphaned\]/);
  });

  it('should keep the machine names in --json', async () => {
    const out = await statusText(true);
    assert.match(out, /"status": "drifted"/);
    assert.match(out, /"status": "orphaned"/);
  });

  it('should word the next steps for a first-timer', () => {
    const result = (id: string, status: 'drifted' | 'orphaned') => ({
      entry: { id, kind: 'rule', target: 'claude' },
      status,
      driftedFiles: [],
      missingFiles: [],
    });
    const statuses = [result('a', 'drifted'), result('b', 'orphaned')] as unknown;
    const steps = statusNextSteps(statuses as Parameters<typeof statusNextSteps>[0]).join(' | ');
    assert.match(steps, /Files you edited are kept/);
    assert.match(steps, /no longer in the catalog/);
  });
});
