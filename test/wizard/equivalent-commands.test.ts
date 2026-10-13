/**
 * Every guided command prints an "Equivalent command" after the user confirms. It must repeat what
 * actually ran: the options in effect (`--force`, `--target`) and the project folder when it is not
 * the current one, quoted so a path with spaces stays one argument.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { locationFlags, quotePath, wrapCommand } from '../../dist-cli/wizard/command-strings';
import { equivalentPrune } from '../../dist-cli/commands/prune-guided';
import { equivalentInit } from '../../dist-cli/commands/init-guided';
import { equivalentUninstall } from '../../dist-cli/commands/uninstall-confirm';
import { equivalentUpdate, updateLocation } from '../../dist-cli/commands/update-guided';
import { detectProjectTarget } from '../../dist-cli/cli-helpers';

const HERE = process.cwd();
const ELSEWHERE = path.join(HERE, 'my project');
const QUOTED_ELSEWHERE = `--project-dir "${ELSEWHERE}"`;
const PRUNE = {
  projectDir: HERE,
  catalogDir: '',
  packs: '',
  apply: false,
  yes: false,
  force: false,
  json: false,
};

describe('locationFlags', () => {
  it('should leave out --project-dir for the current folder', () => {
    assert.deepEqual(locationFlags({ target: 'claude', projectDir: HERE }), ['--target claude']);
  });

  it('should quote a project folder elsewhere', () => {
    assert.deepEqual(locationFlags({ projectDir: ELSEWHERE }), [QUOTED_ELSEWHERE]);
  });
});

describe('quotePath', () => {
  const CASES = [
    ['posix', '/home/u/a$b', `'/home/u/a$b'`],
    ['posix', `/home/u/it's`, `'/home/u/it'"'"'s'`],
    ['posix', '/home/u/a`b!c', "'/home/u/a`b!c'"],
    ['powershell', String.raw`C:\a$env b`, String.raw`'C:\a$env b'`],
    ['powershell', String.raw`C:\it's`, String.raw`'C:\it''s'`],
    ['powershell', String.raw`C:\a` + '`b', String.raw`'C:\a` + "`b'"],
    ['cmd', String.raw`C:\x\%TEMP%y`, String.raw`"C:\x\"^%"TEMP"^%"y"`],
    ['cmd', String.raw`C:\a!b`, String.raw`"C:\a"^!"b"`],
  ] as const;
  for (const [shell, dir, expected] of CASES) {
    it(`should keep ${dir} literal in ${shell}`, () => {
      assert.equal(quotePath(dir, shell), expected);
    });
  }

  it('should double-quote a path with only spaces in every shell', () => {
    for (const shell of ['posix', 'powershell', 'cmd'] as const) {
      assert.equal(quotePath('/a b', shell), '"/a b"');
    }
  });

  it('should keep a quoted path whole when a command wraps', () => {
    const quoted = quotePath(`/x/it's a b`, 'posix');
    const lines = wrapCommand(`sigil prune --project-dir ${quoted}`, 20, 'posix');
    assert.ok(
      lines.some(line => line.includes(quoted)),
      lines.join('\n'),
    );
  });
});

describe('locationFlags on Windows', () => {
  it(
    'should treat the current folder in another case as the current folder',
    { skip: process.platform !== 'win32' },
    () => {
      assert.deepEqual(locationFlags({ projectDir: HERE.toUpperCase() }), []);
    },
  );
});

describe('guided equivalent commands', () => {
  it('should carry --force, the target and the folder into the prune command', () => {
    const cmd = equivalentPrune({ ...PRUNE, force: true, projectDir: ELSEWHERE }, 'copilot');
    assert.equal(cmd, `sigil prune --apply --yes --force --target copilot ${QUOTED_ELSEWHERE}`);
  });

  it('should keep the prune command short in the current folder', () => {
    assert.equal(equivalentPrune(PRUNE, 'claude'), 'sigil prune --apply --yes --target claude');
  });

  it('should carry the folder into the init command', () => {
    assert.equal(
      equivalentInit('claude', ELSEWHERE),
      `sigil init --target claude ${QUOTED_ELSEWHERE}`,
    );
  });

  it('should carry the folder into the uninstall command', () => {
    const cmd = equivalentUninstall(['shared/git'], true, {
      target: 'claude',
      projectDir: ELSEWHERE,
    });
    assert.equal(
      cmd,
      `sigil uninstall shared/git --yes --force --target claude ${QUOTED_ELSEWHERE}`,
    );
  });

  it('should carry the target and folder into the update command', () => {
    const cmd = equivalentUpdate(['shared/git'], false, {
      target: 'claude',
      projectDir: ELSEWHERE,
    });
    assert.equal(cmd, `sigil update shared/git --yes --target claude ${QUOTED_ELSEWHERE}`);
  });
});

describe('updateLocation', () => {
  it('should name the detected target when none was given', () => {
    const where = updateLocation({ projectDir: HERE });
    assert.equal(where.target, detectProjectTarget(HERE));
  });

  it('should keep a target that was given', () => {
    assert.equal(updateLocation({ projectDir: HERE, target: 'copilot' }).target, 'copilot');
  });
});
