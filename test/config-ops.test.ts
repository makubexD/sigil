/**
 * Tests for src/config-ops.ts — install-time variable substitution in front of a target's
 * scaffoldConfig. Each fixture is an `mcp` artifact built here; the real catalog is never read.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { scaffoldConfigOps } from '../dist-cli/config-ops';
import { SigilError } from '../dist-cli/errors';
import { getTarget } from '../dist-cli/targets';
import { withTempDirAsync } from './helpers/temp-dir';
import type { ConfigMergeOp, ResolvedArtifact, ResolvedCatalog, Target } from '../dist-cli/types';

const ID = 'shared/ado';
const ORG = { title: 'Azure DevOps organization', description: 'The <org> value' };
const SIX = ['claude', 'copilot', 'cursor', 'codex', 'antigravity', 'opencode'] as const;

/** The JSON key each target puts its server map under. */
const SERVERS_KEY: Record<(typeof SIX)[number], string> = {
  claude: 'mcpServers',
  copilot: 'mcpServers',
  cursor: 'mcpServers',
  codex: 'mcp_servers',
  antigravity: 'mcpServers',
  opencode: 'mcp',
};

interface FixtureOptions {
  vars?: Record<string, { title: string; description: string }>;
  env?: Record<string, string>;
  args?: string[];
}

/** One `mcp` artifact for the fixture catalog. */
function fixtureArtifact(options: FixtureOptions = {}): ResolvedArtifact {
  const frontmatter: Record<string, unknown> = {
    kind: 'mcp',
    title: 'Azure DevOps',
    description: 'Azure DevOps MCP server',
    server: {
      command: 'npx',
      args: options.args ?? [
        '-y',
        '@azure-devops/mcp@2.10.0',
        '{sigil:var:ORG}',
        '--authentication',
        'azcli',
      ],
      ...(options.env !== undefined ? { env: options.env } : {}),
    },
  };
  if (options.vars !== undefined) frontmatter.vars = options.vars;
  return {
    id: ID,
    kind: 'mcp',
    filePath: '/fake/ado.mcp.md',
    frontmatter,
    body: '',
  };
}

/** A resolved catalog holding just `artifact`. */
function makeCatalog(artifact: ResolvedArtifact): ResolvedCatalog {
  return {
    artifacts: [artifact],
    byId: new Map([[artifact.id, artifact]]),
    languages: new Map(),
  };
}

/** The one server config a target's op writes. */
function serverOf(
  targetName: (typeof SIX)[number],
  ops: readonly ConfigMergeOp[],
): Record<string, unknown> {
  const key = SERVERS_KEY[targetName];
  const servers = ops[0]!.fragment[key] as Record<string, Record<string, unknown>>;
  return servers['ado']!;
}

describe('scaffoldConfigOps — a literal var on every target', () => {
  for (const name of SIX) {
    it(`writes contoso and no token for ${name}`, async () => {
      await withTempDirAsync(async projectDir => {
        const catalog = makeCatalog(fixtureArtifact({ vars: { ORG } }));
        const ops = await scaffoldConfigOps(getTarget(name), ID, catalog, {
          projectDir,
          scope: 'project',
          vars: { ORG: 'contoso' },
        });

        assert.ok(ops.length > 0, 'at least one op');
        const serialized = JSON.stringify(ops);
        assert.ok(serialized.includes('contoso'), serialized);
        assert.ok(!serialized.includes('{sigil:'), serialized);
      });
    });
  }
});

describe('scaffoldConfigOps — Codex TOML fragment', () => {
  it('hands the TOML writer args holding contoso', async () => {
    await withTempDirAsync(async projectDir => {
      const catalog = makeCatalog(fixtureArtifact({ vars: { ORG } }));
      const ops = await scaffoldConfigOps(getTarget('codex'), ID, catalog, {
        projectDir,
        scope: 'project',
        vars: { ORG: 'contoso' },
      });

      assert.equal(ops[0]!.file, '.codex/config.toml');
      const server = serverOf('codex', ops);
      assert.ok((server.args as string[]).includes('contoso'), String(server.args));
    });
  });
});

describe('scaffoldConfigOps — env token and a var together', () => {
  // Antigravity's dialect expands no environment references and drops an identity `env` entry, so
  // its entry is asserted as dropped rather than as a target syntax.
  const ENV_EXPECTED: Partial<
    Record<(typeof SIX)[number], (server: Record<string, unknown>) => void>
  > = {
    claude: server => assert.deepEqual(server.env, { T: '${T}' }),
    copilot: server => assert.deepEqual(server.env, { T: '${T}' }),
    cursor: server => assert.deepEqual(server.env, { T: '${env:T}' }),
    codex: server => {
      assert.ok(!('env' in server), 'Codex forwards the name instead');
      assert.deepEqual(server.env_vars, ['T']);
    },
    opencode: server => assert.deepEqual(server.environment, { T: '{env:T}' }),
    antigravity: server => assert.ok(!('env' in server), 'the identity entry is dropped'),
  };

  for (const name of SIX) {
    it(`keeps the var literal and expands the env token for ${name}`, async () => {
      await withTempDirAsync(async projectDir => {
        const catalog = makeCatalog(
          fixtureArtifact({ vars: { ORG }, env: { T: '{sigil:env:T}' } }),
        );
        const ops = await scaffoldConfigOps(getTarget(name), ID, catalog, {
          projectDir,
          scope: 'project',
          vars: { ORG: 'contoso' },
        });

        const serialized = JSON.stringify(ops);
        assert.ok(serialized.includes('contoso'), serialized);
        assert.ok(!serialized.includes('{sigil:'), serialized);
        ENV_EXPECTED[name]!(serverOf(name, ops));
      });
    });
  }
});

describe('scaffoldConfigOps — failures and pass-through', () => {
  it('rejects a missing var, naming it and the artifact', async () => {
    await withTempDirAsync(async projectDir => {
      const catalog = makeCatalog(fixtureArtifact({ vars: { ORG } }));
      await assert.rejects(
        () =>
          scaffoldConfigOps(getTarget('claude'), ID, catalog, {
            projectDir,
            scope: 'project',
            vars: {},
          }),
        (err: unknown) => {
          assert.ok(err instanceof SigilError);
          assert.match(err.message, /shared\/ado/);
          assert.match(err.message, /ORG/);
          return true;
        },
      );
    });
  });

  it('delegates unchanged for an artifact with no vars:', async () => {
    await withTempDirAsync(async projectDir => {
      const catalog = makeCatalog(fixtureArtifact({ args: ['-y', '@azure-devops/mcp@2.10.0'] }));
      const target = getTarget('claude');
      const options = { projectDir, scope: 'project' as const };

      const direct = await target.scaffoldConfig!(ID, catalog, options);
      const wrapped = await scaffoldConfigOps(target, ID, catalog, { ...options, vars: {} });

      assert.deepEqual(wrapped, direct);
    });
  });

  it('leaves the input resolved catalog untouched', async () => {
    await withTempDirAsync(async projectDir => {
      const artifact = fixtureArtifact({ vars: { ORG } });
      const catalog = makeCatalog(artifact);

      await scaffoldConfigOps(getTarget('claude'), ID, catalog, {
        projectDir,
        scope: 'project',
        vars: { ORG: 'contoso' },
      });

      const server = catalog.byId.get(ID)!.frontmatter.server as { args: string[] };
      assert.ok(server.args.includes('{sigil:var:ORG}'), String(server.args));
      assert.equal(catalog.artifacts[0], artifact);
    });
  });

  it('rejects an op a target left holding a token', async () => {
    const fake = {
      name: 'fake',
      scaffoldConfig: async (): Promise<ConfigMergeOp[]> => [
        { file: 'fake.json', fragment: { server: '{sigil:var:ORG}' }, strategy: {} },
      ],
    } as unknown as Target;
    const catalog = makeCatalog(fixtureArtifact({ args: ['-y', '@azure-devops/mcp@2.10.0'] }));

    await assert.rejects(
      () => scaffoldConfigOps(fake, ID, catalog, { projectDir: '/tmp/fake', vars: {} }),
      (err: unknown) => err instanceof SigilError && /fake/.test(err.message),
    );
  });
});
