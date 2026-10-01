/**
 * After an install the user is told what to do next (restart or reload the tool), per tool, and
 * only when something was actually written.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { withTempDirAsync } from '../helpers/temp-dir';

const CATALOG = path.resolve(__dirname, '../../catalog');
const PACKS = path.resolve(__dirname, '../../packs.yaml');

async function install(dir: string, target: string, selector: string): Promise<string> {
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
      dryRun: false,
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

describe('sigil add — next steps', () => {
  it('should tell a Claude Code user to open a new session', async () => {
    await withTempDirAsync(async dir => {
      const out = await install(dir, 'claude', 'rule:shared/git');
      assert.match(out, /Next: .*Claude Code/s);
    });
  });

  it('should tell a Copilot user to reload the VS Code window', async () => {
    await withTempDirAsync(async dir => {
      const out = await install(dir, 'copilot', 'rule:shared/git');
      assert.match(out, /Next: .*Reload Window/s);
    });
  });

  it('should say nothing about next steps when nothing was written', async () => {
    await withTempDirAsync(async dir => {
      await install(dir, 'claude', 'rule:shared/git');
      const again = await install(dir, 'claude', 'rule:shared/git');
      assert.doesNotMatch(again, /Next:/);
    });
  });
});
