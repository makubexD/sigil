/**
 * `shared/ado` after the install-variable move: it authenticates through the Azure CLI, so every
 * target writes the same azcli server with the organization as a literal it gets at install, and
 * none writes an environment block. A real `sigil build` must leave no `{sigil:var:` token: the
 * Claude plugin turns it into `${user_config.ADO_ORG}`, and no other channel may ship it raw.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runBuild } from '../../dist-cli/commands/build';
import { scaffoldConfigOps } from '../../dist-cli/config-ops';
import { antigravityConfigPluginArtifacts } from '../../dist-cli/targets/antigravity/plugin-config';
import { getTarget } from '../../dist-cli/targets/index';
import { CATALOG_DIR, loadResolvedCatalog } from '../helpers/catalog';
import { makeTempDir, withTempDirAsync } from '../helpers/temp-dir';
import type { ConfigMergeOp } from '../../dist-cli/types';

const ADO = 'shared/ado';
const ORG = 'contoso';
const PACKAGE = '@azure-devops/mcp@2.10.0';
const PACKS = path.resolve(__dirname, '../../packs.yaml');

const TARGETS = ['claude', 'copilot', 'cursor', 'codex', 'antigravity', 'opencode'] as const;
type TargetName = (typeof TARGETS)[number];

/** The JSON key each target puts its server map under. */
const SERVERS_KEY: Record<TargetName, string> = {
  claude: 'mcpServers',
  copilot: 'mcpServers',
  cursor: 'mcpServers',
  codex: 'mcp_servers',
  antigravity: 'mcpServers',
  opencode: 'mcp',
};

let projectDir = '';

before(() => {
  projectDir = makeTempDir('sigil-ado-');
});

after(() => {
  fs.rmSync(projectDir, { recursive: true, force: true });
});

/** The ops one target builds for `shared/ado` at project scope with a sample organization. */
async function opsFor(name: TargetName): Promise<ConfigMergeOp[]> {
  return scaffoldConfigOps(getTarget(name), ADO, await loadResolvedCatalog(), {
    projectDir,
    scope: 'project',
    vars: { ADO_ORG: ORG },
  });
}

/** The `ado` server config one target's op writes. */
function serverOf(name: TargetName, ops: readonly ConfigMergeOp[]): Record<string, unknown> {
  const servers = ops[0]!.fragment[SERVERS_KEY[name]] as Record<string, Record<string, unknown>>;
  return servers['ado']!;
}

describe('shared/ado across every target', () => {
  it('should write the pinned azcli server with the organization as a literal', async () => {
    for (const name of TARGETS) {
      const server = serverOf(name, await opsFor(name));
      const args = Array.isArray(server['command']) ? server['command'] : server['args'];
      assert.ok(Array.isArray(args), `${name}: args or an array command`);
      assert.ok(args.includes(PACKAGE), `${name}: pinned package`);
      assert.ok(args.includes(ORG), `${name}: the install value`);
      assert.ok(args.includes('azcli'), `${name}: Azure CLI authentication`);
      // npm 12's npx skips install scripts without this, and the server dies loading keytar.
      assert.ok(
        args.indexOf('--allow-scripts=keytar') < args.indexOf(PACKAGE) &&
          args.includes('--allow-scripts=keytar'),
        `${name}: keytar's install script allowed, as an npx option before the package`,
      );
    }
  });

  it('should have no config skip reason on any target', async () => {
    const catalog = await loadResolvedCatalog();
    for (const name of TARGETS) {
      assert.equal(
        getTarget(name).configSkipReason?.(catalog.byId.get(ADO)!),
        undefined,
        `${name}: no skip reason`,
      );
    }
  });

  it('should write no env, environment or env_vars key on any target', async () => {
    for (const name of TARGETS) {
      const server = serverOf(name, await opsFor(name));
      for (const key of ['env', 'environment', 'env_vars']) {
        assert.ok(!(key in server), `${name}: no ${key} key`);
      }
    }
  });

  it('should hold no PERSONAL token or pat authentication in any fragment', async () => {
    for (const name of TARGETS) {
      const text = JSON.stringify(await opsFor(name));
      assert.doesNotMatch(text, /PERSONAL/, `${name}: no personal token`);
      assert.doesNotMatch(text, /\bpat\b/, `${name}: no pat authentication`);
    }
  });

  it('should write OpenCode at project scope as a local server with an array command', async () => {
    const ops = await opsFor('opencode');
    assert.equal(ops.length, 1);
    assert.equal(ops[0]!.file, '.opencode/opencode.json');
    const server = serverOf('opencode', ops);
    assert.ok(Array.isArray(server['command']), 'command is one array');
    assert.equal(server['type'], 'local');
  });

  it('should leave a server with install variables out of Antigravity plugins', async () => {
    const ids = antigravityConfigPluginArtifacts(await loadResolvedCatalog()).map(a => a.id);
    assert.ok(!ids.includes('shared/ado'), ids.join(', '));
  });

  it('should leave no {sigil:var: token in a real build of every target', async () => {
    await withTempDirAsync(async outDir => {
      await runBuild({ target: 'all', catalogDir: CATALOG_DIR, packs: PACKS, outDir });
      for (const file of filesUnder(outDir)) {
        const text = fs.readFileSync(path.join(outDir, file), 'utf8');
        assert.ok(!text.includes('{sigil:var:'), `${file}: no install-variable token`);
      }
    });
  });
});

/** Every regular file under `dir`, as paths relative to it. */
function filesUnder(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(path.relative(dir, full));
    }
  };
  walk(dir);
  return files;
}
