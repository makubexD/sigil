/**
 * The `McpDialect` seam (src/targets/mcp-dialect.ts): one `renderMcpServer` and one `mcpServerOp`
 * for every target's MCP file, given as data. These tests pin the transform against fixture
 * artifacts (the step 3 table) and, for the portable dialect, against `portableMcpServer` over
 * every catalog `mcp` artifact — the byte-identical output the golden file in
 * portable-mcp.test.ts locks down.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isMcpSkip, mcpServerOp, renderMcpServer } from '../../dist-cli/targets/mcp-dialect';
import type { McpDialect } from '../../dist-cli/targets/mcp-dialect';
import {
  PORTABLE_MCP_DIALECT,
  PORTABLE_MCP_SERVERS_KEY,
  portableMcpServer,
} from '../../dist-cli/targets/portable-mcp';
import type { Artifact, ConfigRoot } from '../../dist-cli/types';
import { loadResolvedCatalog } from '../helpers/catalog';

type McpSource = Pick<Artifact, 'id' | 'frontmatter'>;

/** A fixture mcp artifact: `{id, frontmatter: {kind: 'mcp', server}}`, plus optional name fields. */
function mcpArtifact(
  server: Record<string, unknown>,
  opts: { id?: string; name?: string; description?: string } = {},
): McpSource {
  const frontmatter: Record<string, unknown> = { kind: 'mcp', server };
  if (opts.name !== undefined) frontmatter.name = opts.name;
  if (opts.description !== undefined) frontmatter.description = opts.description;
  return { id: opts.id ?? 'shared/fixture', frontmatter };
}

/** A `${env:NAME}`-syntax dialect, overridable per test. */
function dialect(overrides: Partial<McpDialect> = {}): McpDialect {
  return {
    serversKey: 'mcpServers',
    envSyntax: { format: name => '${env:' + name + '}' },
    interpolatedFields: ['command', 'args', 'env', 'url', 'headers'],
    remoteType: 'keep',
    ...overrides,
  };
}

describe('renderMcpServer', () => {
  it("should put type: 'stdio' first on a stdio server when stdioType is 'stdio'", () => {
    const rendered = renderMcpServer(
      mcpArtifact({ command: 'npx', args: ['-y'] }),
      dialect({ stdioType: 'stdio' }),
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(Object.keys(rendered.config), ['type', 'command', 'args']);
    assert.equal(rendered.config.type, 'stdio');
  });

  it('should collapse an authored type into the single stdio type, first', () => {
    const rendered = renderMcpServer(
      mcpArtifact({ type: 'http', command: 'npx', args: ['-y'] }),
      dialect({ stdioType: 'stdio' }),
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(Object.keys(rendered.config), ['type', 'command', 'args']);
    assert.equal(rendered.config.type, 'stdio');
  });

  it("should drop type on a remote server when remoteType is 'drop'", () => {
    const rendered = renderMcpServer(
      mcpArtifact({ type: 'http', url: 'https://example.test/mcp', headers: { A: 'B' } }),
      dialect({ remoteType: 'drop' }),
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(Object.keys(rendered.config), ['url', 'headers']);
  });

  it("should keep type in place on a remote server when remoteType is 'keep'", () => {
    const rendered = renderMcpServer(
      mcpArtifact({ type: 'http', url: 'https://example.test/mcp', headers: { A: 'B' } }),
      dialect(),
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(Object.keys(rendered.config), ['type', 'url', 'headers']);
    assert.equal(rendered.config.type, 'http');
  });

  it('should skip a server with a token in a field outside interpolatedFields', () => {
    const rendered = renderMcpServer(
      mcpArtifact({ command: 'x', args: ['{sigil:env:ORG}'] }),
      dialect({ interpolatedFields: ['command', 'env', 'url', 'headers'] }),
    );
    assert.ok(isMcpSkip(rendered));
    assert.equal(rendered.skip, '{sigil:env:ORG} in args is not expanded by this target');
  });

  it('should expand a token in headers through the dialect env syntax', () => {
    const rendered = renderMcpServer(
      mcpArtifact({
        url: 'https://example.test/mcp',
        headers: { Authorization: 'Bearer {sigil:env:T}' },
      }),
      dialect(),
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config.headers, { Authorization: 'Bearer ${env:T}' });
  });

  it('should throw the shared malformed-token error', () => {
    assert.throws(
      () => renderMcpServer(mcpArtifact({ command: '{sigil:env:bad-name}' }), dialect()),
      /sigil:env/,
    );
  });

  it('should drop a server description from the config', () => {
    const rendered = renderMcpServer(
      mcpArtifact({ command: 'x', description: 'documentation only' }),
      dialect(),
    );
    assert.ok(!isMcpSkip(rendered));
    assert.ok(!('description' in rendered.config));
  });

  it('should take the name from fm.name, else the id basename', () => {
    const named = renderMcpServer(
      mcpArtifact({ command: 'x' }, { name: 'custom', id: 'shared/fixture' }),
      dialect(),
    );
    assert.ok(!isMcpSkip(named));
    assert.equal(named.name, 'custom');

    const fallback = renderMcpServer(mcpArtifact({ command: 'x' }), dialect());
    assert.ok(!isMcpSkip(fallback));
    assert.equal(fallback.name, 'fixture');
  });
});

describe('mcpServerOp', () => {
  it('should build the object-spread op under the dialect serversKey', () => {
    const op = mcpServerOp(mcpArtifact({ command: 'x' }), PORTABLE_MCP_DIALECT, {
      file: '.mcp.json',
      root: 'project',
    });
    assert.equal(op.file, '.mcp.json');
    assert.equal(op.root, 'project');
    assert.deepEqual(op.strategy, { [PORTABLE_MCP_SERVERS_KEY]: 'object-spread' });
    assert.equal(op.section, PORTABLE_MCP_SERVERS_KEY);
    assert.deepEqual(Object.keys(op.fragment), [PORTABLE_MCP_SERVERS_KEY]);
    assert.deepEqual(Object.keys(op.fragment[PORTABLE_MCP_SERVERS_KEY]!), ['fixture']);
  });

  it('should throw when the server is skipped', () => {
    const root: ConfigRoot = 'project';
    assert.throws(
      () =>
        mcpServerOp(
          mcpArtifact({ command: 'x', args: ['{sigil:env:ORG}'] }),
          dialect({ interpolatedFields: ['command', 'env', 'url', 'headers'] }),
          { file: '.mcp.json', root },
        ),
      /is not expanded by this target/,
    );
  });
});

describe('portable dialect over every catalog mcp server', () => {
  it('should equal portableMcpServer output for every catalog mcp artifact', async () => {
    const catalog = await loadResolvedCatalog();
    const servers = catalog.artifacts.filter(a => a.kind === 'mcp');
    assert.ok(servers.length > 0);
    for (const server of servers) {
      const rendered = renderMcpServer(server, PORTABLE_MCP_DIALECT);
      assert.ok(!isMcpSkip(rendered), `${server.id} must not skip on the portable dialect`);
      assert.deepEqual(rendered, portableMcpServer(server), server.id);
    }
  });
});
