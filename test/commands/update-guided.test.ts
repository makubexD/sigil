/**
 * In a terminal, `sigil update` previews what would change and asks before writing. `--yes`,
 * `--dry-run` and any non-terminal run behave exactly as before.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { runUpdate } from '../../dist-cli/commands/update';
import { loadManifest, saveManifest, sha256 } from '../../dist-cli/manifest';
import { mockClack } from '../helpers/clack-mock';
import type { MockAnswer } from '../helpers/clack-mock';
import { fakeTTY } from '../helpers/tty';
import { withTempDirAsync } from '../helpers/temp-dir';

const CATALOG = path.resolve(__dirname, '../../catalog');
const PACKS = path.resolve(__dirname, '../../packs.yaml');
const GIT = '.claude/rules/shared-git.md';
const CLEAN = '.claude/rules/shared-clean-code.md';
const OLD = 'old catalog content\n';

/** Installs two rules, then rewinds both to "an older catalog version" (disk matches the manifest). */
async function outdatedProject(dir: string): Promise<void> {
  await runAdd(['rule:shared/git', 'rule:shared/clean-code'], {
    projectDir: dir,
    catalogDir: CATALOG,
    packs: PACKS,
    target: 'claude',
    deps: true,
    dryRun: false,
    interactive: false,
    yes: true,
    overwrite: false,
    settingsLocal: false,
  });
  const manifest = loadManifest(dir);
  for (const entry of manifest.entries) {
    for (const file of entry.files) {
      fs.writeFileSync(path.join(dir, file.path), OLD);
      file.sha256 = sha256(OLD);
    }
  }
  saveManifest(dir, manifest);
}

const read = (dir: string, relative: string): string =>
  fs.readFileSync(path.join(dir, relative), 'utf8');

function options(dir: string, extra: { yes?: boolean; dryRun?: boolean; force?: boolean } = {}) {
  return {
    projectDir: dir,
    target: 'claude',
    catalogDir: CATALOG,
    packs: PACKS,
    force: false,
    dryRun: false,
    yes: false,
    ...extra,
  };
}

/** Runs `update` as if in a terminal, answering prompts from `answers`. */
async function guided(
  dir: string,
  answers: MockAnswer[],
  extra: Parameters<typeof options>[1] = {},
  ids: string[] = [],
): Promise<void> {
  const restoreTTY = fakeTTY();
  const restore = mockClack(answers);
  try {
    await runUpdate(ids, options(dir, extra));
  } finally {
    restore();
    restoreTTY();
  }
}

describe('runUpdate in a terminal', () => {
  it('should write the update after the user chooses to apply it', async () => {
    await withTempDirAsync(async dir => {
      await outdatedProject(dir);
      await guided(dir, ['apply']);
      assert.notEqual(read(dir, GIT), OLD);
      assert.notEqual(read(dir, CLEAN), OLD);
    });
  });

  it('should write nothing when the user cancels', async () => {
    await withTempDirAsync(async dir => {
      await outdatedProject(dir);
      await guided(dir, ['cancel']);
      assert.equal(read(dir, GIT), OLD);
      assert.equal(read(dir, CLEAN), OLD);
    });
  });

  it('should write nothing when the user presses Ctrl+C at the question', async () => {
    await withTempDirAsync(async dir => {
      await outdatedProject(dir);
      await guided(dir, [Symbol('cancel')]);
      assert.equal(read(dir, GIT), OLD);
    });
  });

  it('should update only the artifacts the user picks', async () => {
    await withTempDirAsync(async dir => {
      await outdatedProject(dir);
      await guided(dir, ['pick', ['shared/git']]);
      assert.notEqual(read(dir, GIT), OLD);
      assert.equal(read(dir, CLEAN), OLD);
    });
  });

  it('should keep a file the user edited unless they agree to overwrite it', async () => {
    await withTempDirAsync(async dir => {
      await outdatedProject(dir);
      fs.writeFileSync(path.join(dir, GIT), 'my own edit\n');
      await guided(dir, ['apply']);
      assert.equal(read(dir, GIT), 'my own edit\n');
      assert.notEqual(read(dir, CLEAN), OLD);
    });
  });

  it('should overwrite an edited file when the user chooses the force option', async () => {
    await withTempDirAsync(async dir => {
      await outdatedProject(dir);
      fs.writeFileSync(path.join(dir, GIT), 'my own edit\n');
      await guided(dir, ['force']);
      assert.notEqual(read(dir, GIT), 'my own edit\n');
    });
  });

  it('should say everything is up to date and ask nothing when there is nothing to update', async () => {
    await withTempDirAsync(async dir => {
      await outdatedProject(dir);
      await guided(dir, ['apply']); // brings both rules current
      const before = read(dir, GIT);
      await guided(dir, []); // an empty queue throws if the "Apply?" question appears
      assert.equal(read(dir, GIT), before);
    });
  });

  it('should still offer to overwrite when the only thing left is a file the user edited', async () => {
    await withTempDirAsync(async dir => {
      await outdatedProject(dir);
      await guided(dir, ['apply']);
      fs.writeFileSync(path.join(dir, GIT), 'my own edit\n');
      await guided(dir, ['cancel']); // the question appears, so cancel consumes the answer
      assert.equal(read(dir, GIT), 'my own edit\n');
    });
  });

  it('should not ask anything with --yes', async () => {
    await withTempDirAsync(async dir => {
      await outdatedProject(dir);
      await guided(dir, [], { yes: true }); // an empty queue throws if any prompt appears
      assert.notEqual(read(dir, GIT), OLD);
    });
  });

  it('should not ask anything, or write, with --dry-run', async () => {
    await withTempDirAsync(async dir => {
      await outdatedProject(dir);
      await guided(dir, [], { dryRun: true });
      assert.equal(read(dir, GIT), OLD);
    });
  });
});

describe('runUpdate outside a terminal', () => {
  it('should apply the update without asking, as before', async () => {
    await withTempDirAsync(async dir => {
      await outdatedProject(dir);
      await runUpdate([], options(dir));
      assert.notEqual(read(dir, GIT), OLD);
    });
  });
});
