/**
 * Every guided command prints an "Equivalent command" after the user confirms. It must repeat what
 * actually ran: the options in effect (`--force`, `--target`) and the project folder when it is not
 * the current one, quoted so a path with spaces stays one argument.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { locationFlags } from '../../dist-cli/wizard/command-strings';
import { equivalentPrune } from '../../dist-cli/commands/prune-guided';
import { equivalentInit } from '../../dist-cli/commands/init-guided';
import { equivalentUninstall } from '../../dist-cli/commands/uninstall-confirm';
import { equivalentUpdate } from '../../dist-cli/commands/update-guided';

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
