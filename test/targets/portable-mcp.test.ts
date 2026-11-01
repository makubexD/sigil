/**
 * Claude Code and Copilot both write project MCP servers into the same portable `.mcp.json`. Their
 * fragments must be byte-identical: `uninstall` keeps a server another target still records only
 * when the recorded hashes match (sharedWith, src/commands/uninstall-config.ts), and two different
 * values for one server key would overwrite each other. Both targets build the entry with
 * `portableMcpOp` (src/targets/portable-mcp.ts). Only the project scope is shared: Claude's local
 * scope wraps the same server under a per-project key in ~/.claude.json, which Copilot never writes.
 *
 * The golden test below pins the exact text `serialize` writes today for every scope and for the
 * generated Claude plugin, so a refactor cannot change a byte unnoticed. Regenerate it with
 * `UPDATE_GOLDEN=1 npm test -- test-compiled/targets/portable-mcp.test.js` and review the diff.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, serialize } from '../../dist-cli/config-merge';
import { getTarget } from '../../dist-cli/targets/index';
import { buildConfigPlugins } from '../../dist-cli/targets/claude-code/plugin-config';
import { configPluginName } from '../../dist-cli/targets/claude-code/plugin-build';
import { artifactTargetsPlatform } from '../../dist-cli/select';
import type { ResolvedCatalog } from '../../dist-cli/types';
import { loadResolvedCatalog } from '../helpers/catalog';

/** Pinned output of every portable MCP write, keyed by `<target>/<scope>/<id>`. */
const GOLDEN_PATH = path.resolve(__dirname, '../../test/fixtures/portable-mcp-golden.json');

/** The scopes each target writes a portable MCP server for. */
const TARGET_SCOPES = [
  ['claude', ['project', 'local', 'user']],
  ['copilot', ['project', 'user']],
] as const;

/** Every key's serialized output, sorted so the golden file is stable. */
async function collectPortableMcpOutput(catalog: ResolvedCatalog): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const servers = catalog.artifacts.filter(a => a.kind === 'mcp');
  for (const server of servers) {
    for (const [target, scopes] of TARGET_SCOPES) {
      if (!artifactTargetsPlatform(server, target)) continue;
      const scaffold = getTarget(target).scaffoldConfig!;
      for (const scope of scopes) {
        const ops = await scaffold(server.id, catalog, { projectDir: '.', scope });
        for (const op of ops) {
          const key =
            ops.length > 1
              ? `${target}/${scope}/${server.id}/${op.file}`
              : `${target}/${scope}/${server.id}`;
          out[key] = serialize(op.fragment);
        }
      }
    }
  }

  const plugins = buildConfigPlugins(catalog, { version: '0.0.0-golden' });
  for (const server of servers) {
    if (!artifactTargetsPlatform(server, 'claude')) continue;
    const name = configPluginName(server);
    const plugin = plugins.find(p => p.entry.name === name);
    assert.ok(plugin, `plugin ${name} built for ${server.id}`);
    const content = plugin.files[`plugins/${name}/.mcp.json`];
    assert.ok(content !== undefined, `${server.id}: plugin carries .mcp.json`);
    out[`claude-plugin/plugin/${server.id}`] = content;
  }

  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Fails naming the key when the golden entry is missing, stale, or different. */
async function assertGolden(catalog: ResolvedCatalog): Promise<void> {
  const actual = await collectPortableMcpOutput(catalog);
  if (process.env.UPDATE_GOLDEN === '1') {
    writeFileSync(GOLDEN_PATH, JSON.stringify(actual, null, 2) + '\n');
    return;
  }
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Record<string, string>;
  for (const [key, value] of Object.entries(actual)) {
    assert.ok(key in golden, `missing golden entry ${key}`);
    assert.equal(golden[key], value, `golden mismatch for ${key}`);
  }
  for (const key of Object.keys(golden)) {
    assert.ok(key in actual, `stale golden entry ${key}`);
  }
}

describe('portable .mcp.json entries', () => {
  it('should be identical from Claude and Copilot for every catalog MCP server', async () => {
    const catalog = await loadResolvedCatalog();
    const servers = catalog.artifacts.filter(a => a.kind === 'mcp');
    assert.ok(servers.length > 0);
    for (const server of servers) {
      const ops = await Promise.all(
        ['claude', 'copilot'].map(name =>
          getTarget(name).scaffoldConfig!(server.id, catalog, {
            projectDir: '.',
            scope: 'project',
          }),
        ),
      );
      const [claude, copilot] = ops.map(list => list.find(op => op.file === '.mcp.json'));
      assert.ok(claude && copilot, `${server.id}: both write .mcp.json`);
      assert.equal(canonicalize(claude.fragment), canonicalize(copilot.fragment), server.id);
      assert.equal(canonicalize(claude.strategy), canonicalize(copilot.strategy), server.id);
    }
  });
});

describe('portable MCP golden output', () => {
  it('should match test/fixtures/portable-mcp-golden.json', async () => {
    await assertGolden(await loadResolvedCatalog());
  });
});
