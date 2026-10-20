/**
 * `add` skips a config artifact as "already up to date" only where it is installed. One installed
 * at project scope and added again at local scope has nothing at the local destination, so `add`
 * must write it there (review of docs/audits/2026-10-16/results.md, row 13).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { withTempDir } from '../helpers/temp-dir';

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const HOME_VAR = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';

describe('add: up to date only at the scope asked for', () => {
  it('writes an MCP server at local scope when it is installed only at project scope', () => {
    withTempDir(work => {
      const project = path.join(work, 'project');
      const home = path.join(work, 'home');
      fs.mkdirSync(project);
      fs.mkdirSync(home);
      const sigil = (...args: string[]) =>
        execFileSync(process.execPath, [CLI, ...args, '--project-dir', project], {
          cwd: project,
          encoding: 'utf-8',
          env: { ...process.env, [HOME_VAR]: home },
        });
      const add = ['add', 'mcp:shared/context-mode', '--target', 'claude', '--yes'];

      sigil(...add);
      const out = sigil(...add, '--scope', 'local');

      assert.doesNotMatch(out, /already up to date/);
      const local = path.join(home, '.claude.json');
      assert.ok(fs.existsSync(local), 'the local-scope file was written');
      assert.match(fs.readFileSync(local, 'utf8'), /context-mode/);
    });
  });
});
