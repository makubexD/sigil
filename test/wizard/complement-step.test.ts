/**
 * The wizard's complement choice: it is asked only when an enabled plugin already delivers a pick.
 * Answering "yes" hands `--complement` to `add` (the overlapping skill is never written and the
 * equivalent command says so); the default installs it as plain `sigil add` does.
 *
 * The plugin reader looks at `<home>/.claude/settings.json`; every test passes a temp home through
 * `AddOpts.homeDir`, so the real `~` is never read.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { createRecorder, mockClack, ENTER } from '../helpers/clack-mock';
import type { MockAnswer, Recorder } from '../helpers/clack-mock';
import { fakeTTY } from '../helpers/tty';
import { withTempDirAsync } from '../helpers/temp-dir';

const CATALOG = path.resolve(__dirname, '../../catalog');
const PACKS = path.resolve(__dirname, '../../packs.yaml');

/** The pack plugin the tests enable, and the skill it holds. */
const PACK = 'cli-builder';
const SKILL_FILE = '.claude/skills/cli/SKILL.md';
const COMPLEMENT_QUESTION = 'Some picks are already delivered by an enabled plugin';

/** Enables the `cli-builder` plugin at user scope in `home`. */
function enablePack(home: string): void {
  const dir = path.join(home, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'settings.json'),
    JSON.stringify({ enabledPlugins: { [`${PACK}@sigil`]: true } }, null, 2),
  );
}

/** Runs `sigil add` with no selector in a fake TTY, driving the real wizard; returns its recorder. */
async function addViaWizard(
  projectDir: string,
  homeDir: string,
  answers: MockAnswer[],
): Promise<Recorder> {
  const recorder = createRecorder();
  const restoreTTY = fakeTTY();
  const restore = mockClack(answers, recorder);
  const originalLog = console.log;
  console.log = () => {};
  try {
    await runAdd([], {
      projectDir,
      catalogDir: CATALOG,
      packs: PACKS,
      target: 'claude',
      deps: true,
      dryRun: false,
      interactive: true,
      yes: false,
      overwrite: false,
      settingsLocal: false,
      homeDir,
    });
  } finally {
    console.log = originalLog;
    restore();
    restoreTTY();
  }
  return recorder;
}

/** The answers down the "Recommended" path, through deps and the complement step. */
function packPath(complement: MockAnswer): MockAnswer[] {
  return ['pack', `pack:${PACK}`, ENTER, complement, 'proceed'];
}

describe('wizard complement step', () => {
  it('should not ask when no enabled plugin delivers a pick', async () => {
    await withTempDirAsync(async project => {
      await withTempDirAsync(async home => {
        const rec = await addViaWizard(project, home, ['pack', `pack:${PACK}`, ENTER, 'proceed']);

        assert.ok(fs.existsSync(path.join(project, SKILL_FILE)));
        assert.ok(!rec.prompts.some(p => p.message === COMPLEMENT_QUESTION));
      });
    });
  });

  it('should skip the overlapping skill and print --complement when the answer is yes', async () => {
    await withTempDirAsync(async project => {
      await withTempDirAsync(async home => {
        enablePack(home);

        const rec = await addViaWizard(project, home, packPath('yes'));

        assert.ok(rec.prompts.some(p => p.message === COMPLEMENT_QUESTION));
        assert.ok(!fs.existsSync(path.join(project, SKILL_FILE)));
        assert.match(rec.copied.join('\n'), /--complement/);
        const box = rec.notes.map(n => n.body).join('\n');
        assert.match(box, /Skipped, an enabled plugin already delivers:/);
        assert.doesNotMatch(box, /does not support/);
      });
    });
  });

  it('should install the skill and print no --complement by default', async () => {
    await withTempDirAsync(async project => {
      await withTempDirAsync(async home => {
        enablePack(home);

        const rec = await addViaWizard(project, home, packPath(ENTER));

        assert.ok(fs.existsSync(path.join(project, SKILL_FILE)));
        assert.doesNotMatch(rec.copied.join('\n'), /--complement/);
      });
    });
  });
});
