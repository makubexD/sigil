/**
 * Codex MCP config: the target writes `[mcp_servers.<name>]` tables into `.codex/config.toml`
 * (project) / `$CODEX_HOME/config.toml` (user) through the same merge machinery as the hook files.
 *
 * Codex does not expand `${NAME}` (probe A7): an `env` value that is exactly `{sigil:env:KEY}` for
 * its own key forwards by name (`env_vars`), and any other token is refused.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CodexTarget } from '../../dist-cli/targets/codex';
import { buildCodexMcpOps } from '../../dist-cli/targets/codex/mcp-ops';
import { supportedKinds } from '../../dist-cli/targets/capabilities';
import { resolveSelection } from '../../dist-cli/select/selector-resolve';
import { loadResolvedCatalog } from '../helpers/catalog';
import { withTempDir } from '../helpers/temp-dir';
import type { Artifact, ConfigMergeOp, ResolvedCatalog } from '../../dist-cli/types';

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const PROJECT_DIR = '/abs/project';

interface FakeMcp {
  id: string;
  kind: 'mcp';
  filePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

/** An mcp artifact with the fixture's base frontmatter, plus any per-case overrides. */
function makeMcp(overrides: Record<string, unknown> = {}, id = 'shared/test-mcp'): FakeMcp {
  const frontmatter: Record<string, unknown> = {
    kind: 'mcp',
    title: 'Test MCP',
    description: 'Test',
    server: { command: 'node', args: ['-e', 'x'] },
    ...overrides,
  };
  // An explicit `undefined` override means "this key is absent", not "set to undefined".
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined) delete frontmatter[key];
  }
  return { id, kind: 'mcp', filePath: '/fake/mcp.md', frontmatter, body: '' };
}

function makeCatalog(...artifacts: FakeMcp[]): ResolvedCatalog {
  return {
    artifacts,
    byId: new Map(artifacts.map(a => [a.id, a])),
    languages: new Map(),
  } as unknown as ResolvedCatalog;
}

const scaffold = async (
  target: CodexTarget,
  artifactId: string,
  catalog: ResolvedCatalog,
  scope: 'project' | 'local' | 'user',
) => target.scaffoldConfig!(artifactId, catalog, { projectDir: PROJECT_DIR, scope });

/** The `[name]` server config from one op's fragment. */
function serverOf(op: ConfigMergeOp, name: string): Record<string, unknown> {
  const servers = op.fragment.mcp_servers as Record<string, Record<string, unknown>>;
  return servers[name]!;
}

describe('codex mcp config — scaffoldConfig', () => {
  const target = new CodexTarget();

  it('project scope: one object-spread op on .codex/config.toml (command, args, no type)', async () => {
    const catalog = await loadResolvedCatalog();
    const ops = await scaffold(target, 'shared/filesystem', catalog, 'project');

    assert.equal(ops.length, 1);
    const op = ops[0]!;
    assert.equal(op.file, '.codex/config.toml');
    assert.equal(op.root, 'project');
    assert.equal(op.strategy.mcp_servers, 'object-spread');
    assert.equal(op.section, 'mcp_servers');

    const server = serverOf(op, 'filesystem');
    assert.equal(server.command, 'npx');
    assert.deepEqual(server.args, ['-y', '@modelcontextprotocol/server-filesystem@2026.8.31', '.']);
    assert.ok(!('type' in server), 'Codex infers stdio from command, never writes a type');
  });

  it('remote server: url only (type and headers dropped)', async () => {
    const catalog = await loadResolvedCatalog();
    const ops = await scaffold(target, 'shared/maku-jam', catalog, 'project');

    assert.deepEqual(serverOf(ops[0]!, 'maku-jam'), { url: 'https://mcp.jam.dev/mcp' });
  });

  it('user scope: config.toml under the codex-home root', async () => {
    const catalog = makeCatalog(makeMcp());
    const ops = await scaffold(target, 'shared/test-mcp', catalog, 'user');

    assert.equal(ops[0]!.file, 'config.toml');
    assert.equal(ops[0]!.root, 'codex-home');
  });

  it('configScopes covers hook and mcp with their own sections', () => {
    const scopes = target.configScopes(['hook', 'mcp'], PROJECT_DIR);
    const project = scopes.find(sc => sc.value === 'project')!;
    const byKind = new Map(project.destinations.map(d => [d.kind, d]));

    assert.equal(byKind.get('hook')!.section, 'hooks');
    assert.equal(byKind.get('hook')!.file, '.codex/hooks.json');
    assert.equal(byKind.get('mcp')!.section, 'mcp_servers');
    assert.equal(byKind.get('mcp')!.file, '.codex/config.toml');
  });

  it('local scope throws, naming project and user', async () => {
    const catalog = makeCatalog(makeMcp());
    await assert.rejects(
      () => scaffold(target, 'shared/test-mcp', catalog, 'local'),
      (err: Error) => {
        assert.match(err.message, /project/);
        assert.match(err.message, /user/);
        return true;
      },
    );
  });
});

describe('codex mcp config — env and field mapping', () => {
  it('env value {sigil:env:TOKEN} for key TOKEN becomes env_vars, no env', () => {
    const artifact = makeMcp({ server: { command: 'node', env: { TOKEN: '{sigil:env:TOKEN}' } } });
    const ops = buildCodexMcpOps(artifact as unknown as Artifact, 'project');

    const server = serverOf(ops[0]!, 'test-mcp');
    assert.deepEqual(server.env_vars, ['TOKEN']);
    assert.ok(!('env' in server));
  });

  it('a static env value stays in env, alongside a forwarded name', () => {
    const artifact = makeMcp({
      server: { command: 'node', env: { TOKEN: '{sigil:env:TOKEN}', HOME: '/tmp' } },
    });
    const ops = buildCodexMcpOps(artifact as unknown as Artifact, 'project');

    const server = serverOf(ops[0]!, 'test-mcp');
    assert.deepEqual(server.env_vars, ['TOKEN']);
    assert.deepEqual(server.env, { HOME: '/tmp' });
  });

  it('env value {sigil:env:B} for key A throws, naming B', () => {
    const artifact = makeMcp({ server: { command: 'node', env: { A: '{sigil:env:B}' } } });
    assert.throws(
      () => buildCodexMcpOps(artifact as unknown as Artifact, 'project'),
      (err: Error) => {
        assert.match(err.message, /B/);
        assert.match(err.message, /expand/);
        return true;
      },
    );
  });

  it('a token in args throws, naming the variable', () => {
    const artifact = makeMcp({ server: { command: 'node', args: ['{sigil:env:ORG}'] } });
    assert.throws(
      () => buildCodexMcpOps(artifact as unknown as Artifact, 'project'),
      (err: Error) => {
        assert.match(err.message, /ORG/);
        return true;
      },
    );
  });

  it('remote headers become http_headers, with type dropped', () => {
    const artifact = makeMcp({
      server: { type: 'http', url: 'https://example.com/mcp', headers: { 'X-Api-Key': 'k' } },
    });
    const ops = buildCodexMcpOps(artifact as unknown as Artifact, 'project');

    assert.deepEqual(serverOf(ops[0]!, 'test-mcp'), {
      url: 'https://example.com/mcp',
      http_headers: { 'X-Api-Key': 'k' },
    });
  });

  it('a token in a remote header throws', () => {
    const artifact = makeMcp({
      server: { type: 'http', url: 'https://example.com/mcp', headers: { A: '{sigil:env:B}' } },
    });
    assert.throws(
      () => buildCodexMcpOps(artifact as unknown as Artifact, 'project'),
      (err: Error) => {
        assert.match(err.message, /B/);
        return true;
      },
    );
  });

  it('a remote type Codex does not document (sse) throws', () => {
    const artifact = makeMcp({ server: { type: 'sse', url: 'https://example.com/mcp' } });
    assert.throws(
      () => buildCodexMcpOps(artifact as unknown as Artifact, 'project'),
      (err: Error) => {
        assert.match(err.message, /sse/);
        return true;
      },
    );
  });

  it('a field Codex does not document throws', () => {
    const artifact = makeMcp({ server: { command: 'node', type: 'http' } });
    assert.throws(
      () => buildCodexMcpOps(artifact as unknown as Artifact, 'project'),
      (err: Error) => {
        assert.match(err.message, /type/);
        return true;
      },
    );
  });
});

describe('codex mcp — platforms', () => {
  it('shared/ado is restricted to claude and copilot, so codex skips it', async () => {
    const catalog = await loadResolvedCatalog();
    const { ids, skipped } = resolveSelection({
      selectors: ['shared/ado'],
      filters: {},
      catalog,
      packs: [],
      supportedKinds: supportedKinds(new CodexTarget()),
      targetName: 'codex',
    });

    assert.deepEqual(ids, []);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0]!.cause, 'platform');
    assert.match(skipped[0]!.reason, /claude, copilot/);
  });
});

// ── CLI round trip ────────────────────────────────────────────────────────────

const MCP = 'shared/filesystem';

function sigil(cwd: string, ...args: string[]): string {
  return execFileSync(process.execPath, [CLI, ...args, '--project-dir', cwd], {
    cwd,
    encoding: 'utf-8',
  });
}

function sigilWithEnv(cwd: string, env: NodeJS.ProcessEnv, ...args: string[]): string {
  return execFileSync(process.execPath, [CLI, ...args, '--project-dir', cwd], {
    cwd,
    encoding: 'utf-8',
    env,
  });
}

const bakOf = (fullPath: string) => `${fullPath}.sigil.bak`;

describe('codex mcp — CLI round trip', () => {
  it("add, drift restore, re-add and uninstall only touch sigil's table in a commented config.toml", () => {
    withTempDir(dir => {
      const file = path.join(dir, '.codex/config.toml');
      const seed = [
        '# user keeps this comment',
        'model = "gpt-5"',
        '',
        '[mcp_servers.mine]',
        'command = "echo mine"',
        '',
      ].join('\n');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, seed);

      sigil(dir, 'add', MCP, '--target', 'codex', '--scope', 'project', '--yes');
      const afterAdd = fs.readFileSync(file, 'utf8');
      assert.ok(afterAdd.startsWith(seed), 'user lines kept byte for byte');
      assert.ok(afterAdd.includes('[mcp_servers.filesystem]'), 'sigil table appended');

      // Re-add must not stack a second table.
      sigil(dir, 'add', MCP, '--target', 'codex', '--scope', 'project', '--yes');
      const afterReAdd = fs.readFileSync(file, 'utf8');
      assert.equal(
        afterReAdd.split('[mcp_servers.filesystem]').length - 1,
        1,
        'exactly one sigil table after a re-add',
      );

      // Drift: the user (or some process) deletes sigil's table — update restores it.
      fs.writeFileSync(file, seed);
      sigil(dir, 'update', '--target', 'codex', '--yes');
      const afterUpdate = fs.readFileSync(file, 'utf8');
      assert.ok(afterUpdate.startsWith(seed), 'user lines still intact after drift restore');
      assert.ok(afterUpdate.includes('[mcp_servers.filesystem]'), 'missing table restored');

      // Uninstall removes only sigil's table.
      sigil(dir, 'uninstall', MCP, '--target', 'codex', '--yes');
      const afterUninstall = fs.readFileSync(file, 'utf8');
      assert.ok(!afterUninstall.includes('[mcp_servers.filesystem]'), 'sigil table removed');
      assert.ok(afterUninstall.includes('[mcp_servers.mine]'), 'user server kept');
      assert.ok(afterUninstall.includes('# user keeps this comment'), 'user comment kept');
      assert.ok(afterUninstall.includes('model = "gpt-5"'), 'user model kept');
    });
  });

  it('user scope first write over a user file takes one .sigil.bak', () => {
    withTempDir(dir => {
      withTempDir(home => {
        const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: home };
        const fullPath = path.join(home, 'config.toml');
        const original = '# user comment\nmodel = "gpt-5"\n';
        fs.writeFileSync(fullPath, original);

        sigilWithEnv(dir, env, 'add', MCP, '--target', 'codex', '--scope', 'user', '--yes');
        assert.equal(fs.readFileSync(bakOf(fullPath), 'utf8'), original);

        // A second write keeps the first backup rather than taking another.
        sigilWithEnv(dir, env, 'add', MCP, '--target', 'codex', '--scope', 'user', '--yes');
        assert.equal(fs.readFileSync(bakOf(fullPath), 'utf8'), original);
      });
    });
  });
});
