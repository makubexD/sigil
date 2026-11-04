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
import { SigilError } from '../../dist-cli/errors';
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

  it("should put type: 'local' first on a stdio server when stdioType is 'local'", () => {
    const rendered = renderMcpServer(
      mcpArtifact({ command: 'x' }),
      dialect({ stdioType: 'local' }),
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, { type: 'local', command: 'x' });
    assert.deepEqual(Object.keys(rendered.config), ['type', 'command']);
  });

  it("should replace an authored type with 'local' first on a stdio server", () => {
    const rendered = renderMcpServer(
      mcpArtifact({ command: 'x', type: 'stdio' }),
      dialect({ stdioType: 'local' }),
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, { type: 'local', command: 'x' });
    assert.deepEqual(Object.keys(rendered.config), ['type', 'command']);
  });

  it("should put type: 'stdio' first on a bare stdio server when stdioType is 'stdio'", () => {
    const rendered = renderMcpServer(
      mcpArtifact({ command: 'x' }),
      dialect({ stdioType: 'stdio' }),
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, { type: 'stdio', command: 'x' });
    assert.deepEqual(Object.keys(rendered.config), ['type', 'command']);
  });

  it('should set type: remote first on a remote server when remoteType sets it', () => {
    const rendered = renderMcpServer(
      mcpArtifact({ type: 'http', url: 'u' }),
      dialect({ remoteType: { set: 'remote' } }),
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, { type: 'remote', url: 'u' });
    assert.deepEqual(Object.keys(rendered.config), ['type', 'url']);
  });

  it('should add type: remote first on a remote server that had no type', () => {
    const rendered = renderMcpServer(
      mcpArtifact({ url: 'u' }),
      dialect({ remoteType: { set: 'remote' } }),
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, { type: 'remote', url: 'u' });
    assert.deepEqual(Object.keys(rendered.config), ['type', 'url']);
  });

  it('should keep the authored order of other remote keys after type: remote', () => {
    const rendered = renderMcpServer(
      mcpArtifact({ url: 'u', headers: { A: 'b' } }),
      dialect({ remoteType: { set: 'remote' } }),
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, { type: 'remote', url: 'u', headers: { A: 'b' } });
    assert.deepEqual(Object.keys(rendered.config), ['type', 'url', 'headers']);
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

describe('renderMcpServer field shape', () => {
  /** The step-2 base dialect: env under `environment`, command folded into an array. */
  const shaped = (overrides: Partial<McpDialect> = {}): McpDialect =>
    dialect({
      stdioType: 'local',
      envKey: 'environment',
      commandForm: 'array',
      envSyntax: { format: name => '{env:' + name + '}' },
      ...overrides,
    });

  it('should fold args into command as an array, in command position', () => {
    const rendered = renderMcpServer(mcpArtifact({ command: 'x', args: ['a', 'b'] }), shaped());
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, { type: 'local', command: ['x', 'a', 'b'] });
    assert.deepEqual(Object.keys(rendered.config), ['type', 'command']);
  });

  it('should write [command] when the server has no args', () => {
    const rendered = renderMcpServer(mcpArtifact({ command: 'x' }), shaped());
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, { type: 'local', command: ['x'] });
    assert.deepEqual(Object.keys(rendered.config), ['type', 'command']);
  });

  it('should write [command] when args is empty', () => {
    const rendered = renderMcpServer(mcpArtifact({ command: 'x', args: [] }), shaped());
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, { type: 'local', command: ['x'] });
    assert.deepEqual(Object.keys(rendered.config), ['type', 'command']);
  });

  it("should write env under envKey, in env's key position", () => {
    const rendered = renderMcpServer(
      mcpArtifact({ env: { A: '{sigil:env:A}' }, command: 'x' }),
      shaped(),
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, {
      type: 'local',
      environment: { A: '{env:A}' },
      command: ['x'],
    });
    assert.deepEqual(Object.keys(rendered.config), ['type', 'environment', 'command']);
  });

  it('should expand tokens inside the folded command array', () => {
    const rendered = renderMcpServer(
      mcpArtifact({ command: '{sigil:env:C}', args: ['{sigil:env:D}'] }),
      shaped(),
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, { type: 'local', command: ['{env:C}', '{env:D}'] });
    assert.deepEqual(Object.keys(rendered.config), ['type', 'command']);
  });

  it('should keep command and args apart without commandForm', () => {
    const { commandForm: _commandForm, ...withoutCommandForm } = shaped();
    void _commandForm;
    const rendered = renderMcpServer(
      mcpArtifact({ command: 'x', args: ['a'] }),
      withoutCommandForm,
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, { type: 'local', command: 'x', args: ['a'] });
    assert.deepEqual(Object.keys(rendered.config), ['type', 'command', 'args']);
  });

  it('should keep env under env without envKey while folding command', () => {
    const { envKey: _envKey, ...withoutEnvKey } = shaped();
    void _envKey;
    const rendered = renderMcpServer(mcpArtifact({ command: 'x', env: { A: 'b' } }), withoutEnvKey);
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, { type: 'local', command: ['x'], env: { A: 'b' } });
    assert.deepEqual(Object.keys(rendered.config), ['type', 'command', 'env']);
    assert.ok(!('environment' in rendered.config));
  });

  it('should skip on an authored args name outside interpolatedFields', () => {
    const rendered = renderMcpServer(
      mcpArtifact({ command: 'x', args: ['{sigil:env:D}'] }),
      shaped({ interpolatedFields: ['command', 'env', 'url', 'headers'] }),
    );
    assert.ok(isMcpSkip(rendered));
    assert.match(rendered.skip, /args/);
    assert.match(rendered.skip, /\{sigil:env:D\}/);
  });

  it('should leave a remote server without command unchanged', () => {
    const rendered = renderMcpServer(mcpArtifact({ url: 'u' }), shaped());
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, { url: 'u' });
    assert.deepEqual(Object.keys(rendered.config), ['url']);
    assert.ok(!('command' in rendered.config));
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

describe("renderMcpServer with envSyntax: 'inherited'", () => {
  const inherited: McpDialect<'inherited'> = {
    serversKey: 'mcpServers',
    envSyntax: 'inherited',
    interpolatedFields: [],
    remoteType: 'drop',
  };

  it('should render a server with no env', () => {
    assert.deepEqual(renderMcpServer(mcpArtifact({ command: 'x' }), inherited), {
      name: 'fixture',
      config: { command: 'x' },
    });
  });

  it('should drop env when every entry is an identity entry', () => {
    const rendered = renderMcpServer(
      mcpArtifact({ command: 'x', env: { A: '{sigil:env:A}' } }),
      inherited,
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, { command: 'x' });
    assert.ok(!('env' in rendered.config));
  });

  it('should keep non-identity env entries', () => {
    const rendered = renderMcpServer(
      mcpArtifact({ command: 'x', env: { A: '{sigil:env:A}', B: 'lit' } }),
      inherited,
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, { command: 'x', env: { B: 'lit' } });
  });

  it('should keep the authored order of the remaining env entries', () => {
    const rendered = renderMcpServer(
      mcpArtifact({ command: 'x', env: { B: 'lit', A: '{sigil:env:A}', C: 'v' } }),
      inherited,
    );
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(Object.keys(rendered.config.env as object), ['B', 'C']);
  });

  it('should skip an env entry naming a different variable', () => {
    const rendered = renderMcpServer(
      mcpArtifact({ command: 'x', env: { A: '{sigil:env:B}' } }),
      inherited,
    );
    assert.ok(isMcpSkip(rendered));
    assert.match(rendered.skip, /\{sigil:env:B\}/);
    assert.match(rendered.skip, /in env /);
    assert.match(rendered.skip, /identity env entry/);
  });

  it('should skip a token embedded in an env value', () => {
    const rendered = renderMcpServer(
      mcpArtifact({ command: 'x', env: { A: 'Bearer {sigil:env:A}' } }),
      inherited,
    );
    assert.ok(isMcpSkip(rendered));
    assert.match(rendered.skip, /\{sigil:env:A\}/);
    assert.match(rendered.skip, /in env /);
  });

  it('should skip a token in args', () => {
    const rendered = renderMcpServer(
      mcpArtifact({ command: 'x', args: ['{sigil:env:ORG}'] }),
      inherited,
    );
    assert.ok(isMcpSkip(rendered));
    assert.match(rendered.skip, /\{sigil:env:ORG\}/);
    assert.match(rendered.skip, /in args /);
  });

  it('should skip a token in headers and drop type on a remote server', () => {
    const rendered = renderMcpServer(
      mcpArtifact({
        type: 'http',
        url: 'u',
        headers: { Authorization: 'Bearer {sigil:env:T}' },
      }),
      inherited,
    );
    assert.ok(isMcpSkip(rendered));
    assert.match(rendered.skip, /in headers /);
  });

  it('should drop type on a remote server with no tokens', () => {
    const rendered = renderMcpServer(mcpArtifact({ type: 'http', url: 'u' }), inherited);
    assert.ok(!isMcpSkip(rendered));
    assert.deepEqual(rendered.config, { url: 'u' });
  });

  it('should throw the skip text from mcpServerOp', () => {
    assert.throws(
      () =>
        mcpServerOp(mcpArtifact({ command: 'x', args: ['{sigil:env:ORG}'] }), inherited, {
          file: '.agents/mcp_config.json',
          root: 'project',
        }),
      (err: unknown) =>
        err instanceof SigilError &&
        err.message ===
          '{sigil:env:ORG} in args is not carried by this target: it expands no environment references, and only an identity env entry (NAME: {sigil:env:NAME}) is passed through the inherited environment',
    );
  });

  it('should skip, not throw, on a malformed token under an identity-looking key', () => {
    const rendered = renderMcpServer(
      mcpArtifact({ command: 'x', env: { A: '{sigil:env:1BAD}' } }),
      inherited,
    );
    assert.ok(isMcpSkip(rendered));
    assert.match(rendered.skip, /\{sigil:env:1BAD\}/);
  });

  it('should skip, not drop, an identity-shaped entry whose name is malformed', () => {
    const rendered = renderMcpServer(
      mcpArtifact({ command: 'x', env: { '1BAD': '{sigil:env:1BAD}' } }),
      inherited,
    );
    assert.ok(isMcpSkip(rendered));
    assert.match(rendered.skip, /\{sigil:env:1BAD\}/);
  });
});
