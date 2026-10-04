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
import matter from 'gray-matter';
import { withTempDirAsync } from '../helpers/temp-dir';
import { CATALOG, add } from '../helpers/install-scenario';

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
