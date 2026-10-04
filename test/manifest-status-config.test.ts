/**
 * `computeStatus` for config-kind entries (src/manifest/status-config-check.ts): each recorded
 * fragment is read where its root says (a home-scoped file is not under the project), and a
 * fragment at a file its provider retired reports 'outdated' with a pointer to `sigil update`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeStatus } from '../dist-cli/manifest';
import { canonicalize } from '../dist-cli/config-merge';
import { sha256 } from '../dist-cli/manifest';
import type { Manifest, ManifestEntry } from '../dist-cli/manifest/types';
import { withTempDirAsync } from './helpers/temp-dir';

const SERVER = { command: 'npx', args: ['-y', 'probe-mcp'] };

function mcpEntry(file: string, root: string | undefined, key: string): ManifestEntry {
  const fragment = { [key]: { probe: SERVER } };
  return {
    id: 'shared/probe',
    kind: 'mcp',
    target: 'copilot',
    sigilVersion: '0.1.0',
    files: [],
    configFiles: [
      {
        file,
        ...(root ? { root } : {}),
        fragment,
        strategy: { [key]: 'object-spread' },
        fragmentSha256: sha256(canonicalize(fragment)),
      },
    ],
    installedAt: '2026-10-01T00:00:00.000Z',
  } as unknown as ManifestEntry; // a minimal mcp entry; only id, target and configFiles are read
}

const manifestOf = (entry: ManifestEntry): Manifest =>
  ({ manifestVersion: 2, entries: [entry] }) as unknown as Manifest;

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

describe('computeStatus for config entries', () => {
  it('should read a home-scoped record from its root, not from the project', async () => {
    await withTempDirAsync(async dir => {
      const saved = process.env.COPILOT_HOME;
      try {
        process.env.COPILOT_HOME = path.join(dir, 'home');
        writeJson(path.join(dir, 'home', 'mcp-config.json'), { mcpServers: { probe: SERVER } });
        const project = path.join(dir, 'project');
        fs.mkdirSync(project);
        const entry = mcpEntry('mcp-config.json', 'copilot-home', 'mcpServers');
        const [result] = computeStatus(manifestOf(entry), project, new Set(['shared/probe']));
        assert.equal(result!.status, 'up-to-date', result!.reason);
      } finally {
        if (saved === undefined) delete process.env.COPILOT_HOME;
        else process.env.COPILOT_HOME = saved;
      }
    });
  });

  it("should report a record at a retired file as outdated, pointing to 'sigil update'", async () => {
    await withTempDirAsync(async dir => {
      writeJson(path.join(dir, '.vscode', 'mcp.json'), { servers: { probe: SERVER } });
      const entry = mcpEntry('.vscode/mcp.json', undefined, 'servers');
      const retiredFor = () => [
        {
          from: { file: '.vscode/mcp.json', root: 'project' as const },
          to: { file: '.mcp.json', root: 'project' as const },
        },
      ];
      const [result] = computeStatus(manifestOf(entry), dir, new Set(['shared/probe']), {
        retiredFor,
      });
      assert.equal(result!.status, 'outdated');
      assert.match(result!.reason ?? '', /\.vscode\/mcp\.json.*sigil update/);
    });
  });
});
