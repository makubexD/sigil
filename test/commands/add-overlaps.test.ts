/**
 * `sigil add` reports folders another tool also reads: installing a Cursor skill into a project
 * that already has the same skill for Claude Code means Cursor reads it from `.claude/skills/`
 * too, so the install says the Claude copy goes unused there. Only a real install that wrote a
 * skill says anything; a dry run never does.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

  it('should report the unused Claude copy when adding an agent for Cursor', async () => {
    await withTempDirAsync(async dir => {
      await install(dir, 'claude', 'agent:shared/code-reviewer');
      const out = await install(dir, 'cursor', 'agent:shared/code-reviewer');
      assert.match(out, /Cursor also reads Claude Code's agents/);
      assert.match(out, /shared\/code-reviewer/);
    });
  });

  it('should report the overlap from the Claude install when Cursor came first', async () => {
    await withTempDirAsync(async dir => {
      await install(dir, 'cursor', SKILL);
      const out = await install(dir, 'claude', SKILL);
      assert.match(out, /Cursor also reads Claude Code/);
    });
  });

  it('should refuse OpenCode when Codex already installed the same skill files', async () => {
    await withTempDirAsync(async dir => {
      await install(dir, 'codex', SKILL);
      await assert.rejects(
        install(dir, 'opencode', SKILL),
        /codex already installed skills in this project, and opencode writes the same files/,
      );
    });
  });

  it('should refuse the whole selection, agent included, when Codex owns the skill files', async () => {
    await withTempDirAsync(async dir => {
      await install(dir, 'codex', SKILL);
      await assert.rejects(
        install(dir, 'opencode', 'pack:typescript-tooling'),
        /codex already installed skills in this project, and opencode writes the same files/,
      );
      assert.equal(fs.existsSync(path.join(dir, '.opencode', 'agents')), false);
    });
  });

  it('should refuse OpenCode and each peer in either install order', async () => {
    for (const peer of ['agents-standard', 'codex', 'antigravity']) {
      await withTempDirAsync(async dir => {
        await install(dir, peer, SKILL);
        await assert.rejects(
          install(dir, 'opencode', SKILL),
          new RegExp(`${peer} already installed skills in this project, and opencode writes`),
        );
      });
      await withTempDirAsync(async dir => {
        await install(dir, 'opencode', SKILL);
        await assert.rejects(
          install(dir, peer, SKILL),
          new RegExp(`opencode already installed skills in this project, and ${peer} writes`),
        );
      });
    }
  });

  it('should report the one-copy note when adding a skill for OpenCode that Claude Code also has', async () => {
    await withTempDirAsync(async dir => {
      await install(dir, 'claude', SKILL);
      const out = await install(dir, 'opencode', SKILL);
      assert.match(out, /OpenCode also reads Claude Code's skills/);
      assert.match(out, /shows one copy of each, and which one depends on its version/);
      assert.doesNotMatch(out, /load twice/);
    });
  });
});
