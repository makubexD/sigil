/**
 * `moveRetiredFragments` (src/commands/update-config-move.ts) moves a config fragment recorded at
 * a file its provider retired to the file that replaced it — Copilot's MCP servers moving from
 * VS Code's deprecated `.vscode/mcp.json` to the portable `.mcp.json`. The full migration of a
 * frozen install is covered by install-migration.test.ts; these pin the edge cases.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { moveRetiredFragments } from '../../dist-cli/commands/update-config-move';
import { sha256 } from '../../dist-cli/manifest';
import { canonicalize } from '../../dist-cli/config-merge';
import type { ManifestEntry } from '../../dist-cli/manifest/types';
import type { ConfigMergeOp, RetiredConfigDestination } from '../../dist-cli/types';
import { withTempDirAsync } from '../helpers/temp-dir';
import { resolveConfigRoot } from '../../dist-cli/config-utils';

const SERVER = { command: 'npx', args: ['-y', 'probe-mcp'] };
const OLD_FRAGMENT = { servers: { probe: SERVER } };
const NEW_OP: ConfigMergeOp = {
  file: '.mcp.json',
  root: 'project',
  fragment: { mcpServers: { probe: SERVER } },
  strategy: { mcpServers: 'object-spread' },
};
const RETIRED: RetiredConfigDestination[] = [
  {
    from: { file: '.vscode/mcp.json', root: 'project' },
    to: { file: '.mcp.json', root: 'project' },
  },
];

function entryAt(file: string): ManifestEntry {
  return {
    id: 'shared/probe',
    kind: 'mcp',
    target: 'copilot',
    sigilVersion: '0.1.0',
    files: [],
    configFiles: [
      {
        file,
        fragment: OLD_FRAGMENT,
        strategy: { servers: 'object-spread' },
        fragmentSha256: sha256(canonicalize(OLD_FRAGMENT)),
      },
    ],
    installedAt: '2026-10-01T00:00:00.000Z',
  } as unknown as ManifestEntry; // a minimal mcp entry; only id and configFiles are read
}

function writeJson(dir: string, rel: string, value: unknown): void {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), JSON.stringify(value, null, 2) + '\n');
}
const readJson = (dir: string, rel: string) =>
  JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8')) as Record<
    string,
    Record<string, unknown>
  >;

const opts = (projectDir: string, extra: Partial<{ force: boolean; dryRun: boolean }> = {}) => ({
  projectDir,
  catalogDir: '',
  packs: '',
  force: false,
  dryRun: false,
  ...extra,
});

describe('moveRetiredFragments', () => {
  it("should move sigil's server and leave the user's own entries in the old file", async () => {
    await withTempDirAsync(async dir => {
      writeJson(dir, '.vscode/mcp.json', { servers: { mine: { command: 'mine' }, probe: SERVER } });
      const entry = entryAt('.vscode/mcp.json');
      const result = moveRetiredFragments(entry, opts(dir), [NEW_OP], RETIRED);
      assert.deepEqual(result, { wrote: true, skipped: 0 });
      assert.deepEqual(Object.keys(readJson(dir, '.vscode/mcp.json').servers!), ['mine']);
      assert.deepEqual(readJson(dir, '.mcp.json').mcpServers, { probe: SERVER });
      assert.deepEqual(
        entry.configFiles!.map(c => c.file),
        ['.mcp.json'],
      );
    });
  });

  it('should delete the old file when sigil was its only content', async () => {
    await withTempDirAsync(async dir => {
      writeJson(dir, '.vscode/mcp.json', OLD_FRAGMENT);
      moveRetiredFragments(entryAt('.vscode/mcp.json'), opts(dir), [NEW_OP], RETIRED);
      assert.equal(fs.existsSync(path.join(dir, '.vscode/mcp.json')), false);
    });
  });

  it('should keep a server the user edited unless --force', async () => {
    await withTempDirAsync(async dir => {
      const edited = { servers: { probe: { ...SERVER, args: ['-y', 'probe-mcp', '--debug'] } } };
      writeJson(dir, '.vscode/mcp.json', edited);
      const entry = entryAt('.vscode/mcp.json');
      assert.deepEqual(moveRetiredFragments(entry, opts(dir), [NEW_OP], RETIRED), {
        wrote: false,
        skipped: 1,
      });
      assert.deepEqual(readJson(dir, '.vscode/mcp.json'), edited);
      assert.equal(fs.existsSync(path.join(dir, '.mcp.json')), false);
      moveRetiredFragments(entry, opts(dir, { force: true }), [NEW_OP], RETIRED);
      assert.deepEqual(readJson(dir, '.mcp.json').mcpServers, { probe: SERVER });
    });
  });

  it('should write nothing under --dry-run', async () => {
    await withTempDirAsync(async dir => {
      writeJson(dir, '.vscode/mcp.json', OLD_FRAGMENT);
      const entry = entryAt('.vscode/mcp.json');
      const result = moveRetiredFragments(entry, opts(dir, { dryRun: true }), [NEW_OP], RETIRED);
      assert.equal(result.wrote, true);
      assert.deepEqual(readJson(dir, '.vscode/mcp.json'), OLD_FRAGMENT);
      assert.equal(fs.existsSync(path.join(dir, '.mcp.json')), false);
      assert.deepEqual(
        entry.configFiles!.map(c => c.file),
        ['.vscode/mcp.json'],
      );
    });
  });

  it('should skip the move, not throw, when the new file is not valid JSON', async () => {
    await withTempDirAsync(async dir => {
      writeJson(dir, '.vscode/mcp.json', OLD_FRAGMENT);
      fs.writeFileSync(path.join(dir, '.mcp.json'), '{ not json');
      const entry = entryAt('.vscode/mcp.json');
      const result = moveRetiredFragments(entry, opts(dir), [NEW_OP], RETIRED);
      assert.equal(result.wrote, false);
      assert.deepEqual(readJson(dir, '.vscode/mcp.json'), OLD_FRAGMENT);
      assert.deepEqual(
        entry.configFiles!.map(c => c.file),
        ['.vscode/mcp.json'],
      );
    });
  });

  it('should move a user-level server to $COPILOT_HOME, backing up both files', async () => {
    await withTempDirAsync(async dir => {
      const saved = { ...process.env };
      try {
        // Point every home-like root at the temp dir so nothing real is touched.
        Object.assign(process.env, {
          HOME: dir,
          USERPROFILE: dir,
          APPDATA: dir,
          COPILOT_HOME: path.join(dir, 'copilot-home'),
        });
        const vsUser = path.relative(dir, resolveConfigRoot('vscode-user', dir));
        writeJson(dir, path.join(vsUser, 'mcp.json'), OLD_FRAGMENT);
        writeJson(dir, 'copilot-home/mcp-config.json', { mcpServers: { mine: { command: 'm' } } });
        const entry = entryAt('mcp.json');
        entry.configFiles![0]!.root = 'vscode-user';
        const userOp = { ...NEW_OP, file: 'mcp-config.json', root: 'copilot-home' as const };
        const retired: RetiredConfigDestination[] = [
          {
            from: { file: 'mcp.json', root: 'vscode-user' },
            to: { file: 'mcp-config.json', root: 'copilot-home' },
          },
        ];
        moveRetiredFragments(entry, opts(dir), [userOp], retired);
        const moved = readJson(dir, 'copilot-home/mcp-config.json').mcpServers!;
        assert.deepEqual(Object.keys(moved).sort(), ['mine', 'probe']);
        assert.ok(fs.existsSync(path.join(dir, 'copilot-home/mcp-config.json.sigil.bak')));
        assert.ok(fs.existsSync(path.join(dir, vsUser, 'mcp.json.sigil.bak')));
        assert.deepEqual(
          entry.configFiles!.map(c => [c.file, c.root]),
          [['mcp-config.json', 'copilot-home']],
        );
      } finally {
        for (const key of ['HOME', 'USERPROFILE', 'APPDATA', 'COPILOT_HOME']) {
          if (saved[key] === undefined) delete process.env[key];
          else process.env[key] = saved[key];
        }
      }
    });
  });

  it('should leave a fragment alone when it is not at a retired destination', async () => {
    await withTempDirAsync(async dir => {
      writeJson(dir, '.mcp.json', { mcpServers: { probe: SERVER } });
      const entry = entryAt('.mcp.json');
      assert.deepEqual(moveRetiredFragments(entry, opts(dir), [NEW_OP], RETIRED), {
        wrote: false,
        skipped: 0,
      });
    });
  });
});
