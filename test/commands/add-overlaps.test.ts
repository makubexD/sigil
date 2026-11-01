/**
 * `sigil add` reports folders another tool also reads: installing a Cursor skill into a project
 * that already has the same skill for Claude Code means Cursor reads it from `.claude/skills/`
 * too, so the install says the Claude copy goes unused there. Only a real install that wrote a
 * skill says anything; a dry run never does.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { withTempDirAsync } from '../helpers/temp-dir';

const CATALOG = path.resolve(__dirname, '../../catalog');
const PACKS = path.resolve(__dirname, '../../packs.yaml');
const SKILL = 'skill:shared/cli';

async function install(
  dir: string,
  target: string,
  selector: string,
  dryRun = false,
): Promise<string> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.join(' '));
  try {
    await runAdd([selector], {
      projectDir: dir,
      catalogDir: CATALOG,
      packs: PACKS,
      target,
      deps: false,
      dryRun,
      interactive: false,
      yes: true,
      overwrite: false,
      settingsLocal: false,
    });
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

describe('sigil add — overlap notes', () => {
  it('should report the unused Claude copy when adding a skill for Cursor', async () => {
    await withTempDirAsync(async dir => {
      await install(dir, 'claude', SKILL);
      const out = await install(dir, 'cursor', SKILL);
      assert.match(out, /Cursor also reads Claude Code/);
      assert.match(out, /goes unused there/);
    });
  });

  it('should say nothing when the skill is installed for Cursor only', async () => {
    await withTempDirAsync(async dir => {
      const out = await install(dir, 'cursor', SKILL);
      assert.doesNotMatch(out, /also reads/);
    });
  });

  it('should say nothing on a dry run', async () => {
    await withTempDirAsync(async dir => {
      await install(dir, 'claude', SKILL);
      const out = await install(dir, 'cursor', SKILL, true);
      assert.doesNotMatch(out, /also reads/);
    });
  });

  it('should report the overlap from the Claude install when Cursor came first', async () => {
    await withTempDirAsync(async dir => {
      await install(dir, 'cursor', SKILL);
      const out = await install(dir, 'claude', SKILL);
      assert.match(out, /Cursor also reads Claude Code/);
    });
  });
});
