/**
 * MCP configs reference environment variables through a neutral `{sigil:env:NAME}` token that each
 * target expands into the syntax of the file it writes: `${NAME}` for Claude Code's MCP files and
 * Copilot's portable files (GitHub documents `$VAR` / `${VAR}`). No catalog value ships a
 * provider's syntax, an organisation name, or a floating package tag.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { expandEnvTokens } from '../../dist-cli/targets/env-reference';
import { getAllTargets, getTarget } from '../../dist-cli/targets';
import matter from 'gray-matter';
import { withTempDirAsync } from '../helpers/temp-dir';
import { CATALOG, add, update } from '../helpers/install-scenario';

const SYNTAX = { format: (name: string) => `<${name}>` } as const;

function serverIn(dir: string, file: string, key: string): Record<string, unknown> {
  const json = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Record<
    string,
    Record<string, Record<string, unknown>>
  >;
  return json[key]!.ado!;
}

describe('expandEnvTokens', () => {
  it('should expand tokens in every nested string and leave other values alone', () => {
    const value = { args: ['-y', '{sigil:env:ORG}'], env: { T: 'x{sigil:env:TOKEN}' }, n: 1 };
    assert.deepEqual(expandEnvTokens(value, SYNTAX), {
      args: ['-y', '<ORG>'],
      env: { T: 'x<TOKEN>' },
      n: 1,
    });
  });

  it('should refuse a malformed env token', () => {
    assert.throws(() => expandEnvTokens('{sigil:env:bad name}', SYNTAX), /sigil:env/);
  });
});

describe('ADO MCP install', () => {
  it('should write ${NAME} references for Claude Code', async () => {
    await withTempDirAsync(async dir => {
      await add(dir, 'claude', ['mcp:shared/ado']);
      const server = serverIn(dir, '.mcp.json', 'mcpServers');
      assert.ok((server.args as string[]).includes('${ADO_ORG}'));
      assert.deepEqual(server.env, { ADO_MCP_PERSONAL_TOKEN: '${ADO_MCP_PERSONAL_TOKEN}' });
    });
  });

  it('should write ${NAME} in the portable .mcp.json, the only file Copilot gets', async () => {
    await withTempDirAsync(async dir => {
      await add(dir, 'copilot', ['mcp:shared/ado']);
      assert.equal(fs.existsSync(path.join(dir, '.vscode/mcp.json')), false);
      const portable = serverIn(dir, '.mcp.json', 'mcpServers');
      assert.ok((portable.args as string[]).includes('${ADO_ORG}'));
    });
  });
});

describe('catalog MCP sources', () => {
  const MCPS = path.join(CATALOG, 'shared', 'mcps');
  const sources = fs.readdirSync(MCPS).map(name => ({
    name,
    text: fs.readFileSync(path.join(MCPS, name), 'utf8'),
  }));

  it('should name no organisation and carry no provider env syntax', () => {
    for (const { name, text } of sources) {
      assert.doesNotMatch(text, /cr360dev/, name);
      assert.doesNotMatch(text, /\$\{env:|\$\{[A-Z_]+\}/, name);
    }
  });

  it('should pin the exact version of every npx-launched package', () => {
    for (const { name, text } of sources) {
      const server = matter(text).data.server as { command?: string; args?: string[] } | undefined;
      if (server?.command !== 'npx') continue;
      const pkg = (server.args ?? []).find(arg => !arg.startsWith('-'));
      assert.match(pkg ?? '', /@\d+\.\d+\.\d+$/, `${name}: ${pkg} has no exact version`);
    }
  });
});

describe('MCP env caveat on add', () => {
  it('should warn exactly when the target has a caveat and the server reads env vars', async () => {
    const { getAllTargets } = await import('../../dist-cli/targets/index');
    const { warnMcpEnvCaveats } = await import('../../dist-cli/commands/add/execute-config');
    const { envTokenNames } = await import('../../dist-cli/targets/env-reference');
    const { loadResolvedCatalog } = await import('../helpers/catalog');
    const resolved = await loadResolvedCatalog();
    const mcps = resolved.artifacts.filter(a => a.kind === 'mcp');
    assert.ok(mcps.length > 0);
    const original = console.warn;
    try {
      for (const target of getAllTargets()) {
        for (const artifact of mcps) {
          const lines: string[] = [];
          console.warn = (msg: string) => void lines.push(msg);
          warnMcpEnvCaveats([{ id: artifact.id, artifact }], target);
          const names = envTokenNames(artifact.frontmatter.server);
          const expected = Boolean(target.mcpEnvCaveat) && names.length > 0;
          assert.equal(lines.length > 0, expected, `${target.name} ${artifact.id}`);
          for (const n of expected ? names : []) assert.ok(lines.join('\n').includes(n));
        }
      }
    } finally {
      console.warn = original;
    }
  });

  it('should explain the caveat once however many servers read env vars', async () => {
    // Arrange
    const { warnMcpEnvCaveats } = await import('../../dist-cli/commands/add/execute-config');
    const { loadResolvedCatalog } = await import('../helpers/catalog');
    const resolved = await loadResolvedCatalog();
    const ado = resolved.byId.get('shared/ado');
    assert.ok(ado);
    const target = getTarget('copilot');
    assert.ok(target.mcpEnvCaveat);
    const lines: string[] = [];
    const original = console.warn;
    console.warn = (msg: string) => void lines.push(msg);

    // Act
    try {
      warnMcpEnvCaveats(
        [
          { id: 'shared/ado', artifact: ado },
          { id: 'shared/ado-copy', artifact: ado },
        ],
        target,
      );
    } finally {
      console.warn = original;
    }

    // Assert
    const text = lines.join('\n');
    assert.equal(text.split(target.mcpEnvCaveat).length - 1, 1, text);
    assert.ok(text.includes('shared/ado-copy'), text);
  });
});

describe('mcpEnvCaveat wording', () => {
  it('should never tell the user to write the value into the file', () => {
    for (const target of getAllTargets()) {
      if (!target.mcpEnvCaveat) continue;
      assert.doesNotMatch(target.mcpEnvCaveat, /replace it with the value/i, target.name);
      assert.match(target.mcpEnvCaveat, /secret/i, target.name);
    }
  });
});

describe('update and the MCP env caveat', () => {
  it('should repeat the caveat when update rewrites a server that reads env vars', async () => {
    await withTempDirAsync(async dir => {
      // Arrange
      await add(dir, 'copilot', ['mcp:shared/ado']);
      fs.rmSync(path.join(dir, '.mcp.json'));
      const lines: string[] = [];
      const original = console.warn;
      console.warn = (msg: string) => void lines.push(msg);

      // Act
      try {
        await update(dir, 'copilot');
      } finally {
        console.warn = original;
      }

      // Assert
      assert.ok(
        lines.some(l => l.includes('ado reads')),
        lines.join('\n'),
      );
    });
  });
});
