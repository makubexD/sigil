/**
 * `sigil update` must render a file the same way `sigil add` did. A skill's or agent's Boundary
 * section lists only related artifacts that are installed alongside it; `add` passes the install
 * set, and `update` has to pass what is installed too, or it strips the section from every
 * up-to-date file (found by the 2026-09-27 install audit: `shared/cli` ↔ `shared/wizard`).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { withTempDir } from '../helpers/temp-dir';

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');

function sigil(cwd: string, ...args: string[]): string {
  return execFileSync(process.execPath, [CLI, ...args, '--project-dir', cwd], {
    cwd,
    encoding: 'utf-8',
  });
}

describe('update renders like add', () => {
  it('keeps the Boundary section of a skill whose related skill is installed', () => {
    withTempDir(dir => {
      sigil(dir, 'add', 'skill:shared/cli', 'skill:shared/wizard', '--target', 'claude', '--yes');
      const skill = path.join(dir, '.claude/skills/cli/SKILL.md');
      const before = fs.readFileSync(skill, 'utf8');
      assert.match(before, /## Boundary/, 'add rendered the section');

      const out = sigil(dir, 'update', '--target', 'claude');

      assert.equal(fs.readFileSync(skill, 'utf8'), before);
      assert.doesNotMatch(out, /shared\/cli {2}\(\d+ file\(s\) updated\)/);
    });
  });
});
