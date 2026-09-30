/**
 * Copilot CLI reads project MCP servers from `.mcp.json` / `.github/mcp.json` (`mcpServers`), never
 * VS Code's `.vscode/mcp.json` (`servers`): docs.github.com/en/copilot/how-tos/copilot-cli/
 * customize-copilot/add-mcp-servers. The 2026-09-27 live-prompt campaign found Copilot CLI never
 * loaded a server `sigil add --target copilot` installed, so a project-scope install writes both.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { withTempDir } from '../helpers/temp-dir';

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const MCP = 'mcp:shared/filesystem';

function sigil(cwd: string, ...args: string[]): string {
  return execFileSync(process.execPath, [CLI, ...args, '--project-dir', cwd], {
    cwd,
    encoding: 'utf-8',
  });
}
const readJson = (dir: string, file: string) =>
  JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

describe('copilot MCP reaches both VS Code and Copilot CLI', () => {
  it('project scope writes .vscode/mcp.json (servers) and .mcp.json (mcpServers)', () => {
    withTempDir(dir => {
      sigil(dir, 'add', MCP, '--target', 'copilot', '--scope', 'project', '--yes');
      assert.ok(readJson(dir, '.vscode/mcp.json').servers.filesystem, 'VS Code file');
      assert.ok(readJson(dir, '.mcp.json').mcpServers.filesystem, 'Copilot CLI file');
    });
  });

  it('keeps a server the user already has in .mcp.json', () => {
    withTempDir(dir => {
      const mine = { mcpServers: { mine: { command: 'my-server' } } };
      fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify(mine));
      sigil(dir, 'add', MCP, '--target', 'copilot', '--scope', 'project', '--yes');
      const servers = readJson(dir, '.mcp.json').mcpServers;
      assert.deepEqual(Object.keys(servers).sort(), ['filesystem', 'mine']);
    });
  });

  it('uninstalling one target keeps the .mcp.json server the other target still uses', () => {
    withTempDir(dir => {
      sigil(dir, 'add', MCP, '--target', 'claude', '--scope', 'project', '--yes');
      sigil(dir, 'add', MCP, '--target', 'copilot', '--scope', 'project', '--yes');

      sigil(dir, 'uninstall', 'shared/filesystem', '--target', 'copilot', '--yes');

      assert.ok(readJson(dir, '.mcp.json').mcpServers.filesystem, 'Claude still needs it');
      assert.ok(!fs.existsSync(path.join(dir, '.vscode/mcp.json')), 'Copilot-only file removed');
    });
  });

  it('uninstall removes the server from both files', () => {
    withTempDir(dir => {
      sigil(dir, 'add', MCP, '--target', 'copilot', '--scope', 'project', '--yes');
      sigil(dir, 'uninstall', 'shared/filesystem', '--target', 'copilot', '--yes');
      const has = (file: string, key: string) =>
        fs.existsSync(path.join(dir, file)) && readJson(dir, file)[key]?.filesystem;
      assert.ok(!has('.vscode/mcp.json', 'servers'));
      assert.ok(!has('.mcp.json', 'mcpServers'));
    });
  });
});
