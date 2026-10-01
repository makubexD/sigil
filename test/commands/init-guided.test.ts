/**
 * `sigil init` without `--target` asks which AI tool the project is for, in a terminal. Elsewhere
 * it fails and lists the valid names.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runInit } from '../../dist-cli/commands/init';
import { initTargetOptions } from '../../dist-cli/commands/init-guided';
import { SigilError } from '../../dist-cli/errors';
import { mockClack } from '../helpers/clack-mock';
import type { MockAnswer } from '../helpers/clack-mock';
import { fakeTTY } from '../helpers/tty';
import { withTempDirAsync } from '../helpers/temp-dir';

async function inTerminal(dir: string, answers: MockAnswer[]): Promise<void> {
  const restoreTTY = fakeTTY();
  const restore = mockClack(answers);
  try {
    await runInit({ projectDir: dir });
  } finally {
    restore();
    restoreTTY();
  }
}

describe('initTargetOptions', () => {
  it('should offer every target and say which one was found in the folder', () => {
    const options = initTargetOptions(['copilot']);
    assert.deepEqual(options.map(o => o.value).sort(), ['claude', 'copilot']);
    assert.match(options.find(o => o.value === 'copilot')?.hint ?? '', /found in this folder/i);
    assert.doesNotMatch(
      options.find(o => o.value === 'claude')?.hint ?? '',
      /found in this folder/i,
    );
  });
});

describe('runInit without --target', () => {
  it('should create the chosen target structure in a terminal', async () => {
    await withTempDirAsync(async dir => {
      await inTerminal(dir, ['copilot']);
      assert.equal(fs.existsSync(path.join(dir, '.github/instructions')), true);
      assert.equal(fs.existsSync(path.join(dir, '.claude')), false);
    });
  });

  it('should create nothing when the user cancels', async () => {
    await withTempDirAsync(async dir => {
      await inTerminal(dir, [Symbol('cancel')]);
      assert.deepEqual(fs.readdirSync(dir), []);
    });
  });

  it('should fail outside a terminal and list the valid targets', async () => {
    await withTempDirAsync(async dir => {
      await assert.rejects(runInit({ projectDir: dir }), (error: unknown) => {
        assert.ok(error instanceof SigilError);
        assert.match(error.message, /--target/);
        assert.match(error.hint ?? '', /claude/);
        assert.match(error.hint ?? '', /copilot/);
        return true;
      });
      assert.deepEqual(fs.readdirSync(dir), []);
    });
  });
});

describe('runInit with --target', () => {
  it('should work as before and never prompt', async () => {
    await withTempDirAsync(async dir => {
      await runInit({ target: 'claude', projectDir: dir });
      assert.equal(fs.existsSync(path.join(dir, '.claude/skills')), true);
    });
  });

  it('should still reject an unknown target', async () => {
    await withTempDirAsync(async dir => {
      await assert.rejects(runInit({ target: 'nope', projectDir: dir }), /Unknown target 'nope'/);
    });
  });
});
