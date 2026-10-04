/**
 * Claude Code and Copilot both write project MCP servers into the same portable `.mcp.json`. Their
 * fragments must be byte-identical: `uninstall` keeps a server another target still records only
 * when the recorded hashes match (sharedWith, src/commands/uninstall-config.ts), and two different
 * values for one server key would overwrite each other. Both targets build the entry with
 * `portableMcpOp` (src/targets/portable-mcp.ts). Only the project scope is shared: Claude's local
 * scope wraps the same server under a per-project key in ~/.claude.json, which Copilot never writes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize } from '../../dist-cli/config-merge';
import { getTarget } from '../../dist-cli/targets/index';
import { loadResolvedCatalog } from '../helpers/catalog';

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
