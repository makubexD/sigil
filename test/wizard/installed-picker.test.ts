/**
 * The installed-artifact picker lets someone remove or update by choosing from what is actually
 * installed, instead of having to know ids. Hints carry the state and the dependency relationship.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installedOptions, pickInstalled } from '../../dist-cli/wizard/installed-picker';
import type { ManifestEntry, StatusResult } from '../../dist-cli/manifest/types';
import { mockClack } from '../helpers/clack-mock';

function entry(id: string, kind: string, dependentOf: string[] = []): ManifestEntry {
  return { id, kind, target: 'claude', dependentOf, files: [] } as unknown as ManifestEntry;
}

function status(e: ManifestEntry, state: StatusResult['status']): StatusResult {
  return { entry: e, status: state, driftedFiles: [], missingFiles: [] };
}

describe('installedOptions', () => {
  const skill = entry('shared/review', 'skill');
  const rule = entry('shared/git', 'rule', ['shared/review']);

  it('should use the id as the value and show kind and state in the hint', () => {
    const [option] = installedOptions([skill], [status(skill, 'up-to-date')]);
    assert.equal(option?.value, 'shared/review');
    assert.match(option?.hint ?? '', /skill/);
    assert.match(option?.hint ?? '', /installed/);
  });

  it('should say which artifacts require a dependency', () => {
    const options = installedOptions(
      [skill, rule],
      [status(skill, 'up-to-date'), status(rule, 'up-to-date')],
    );
    assert.match(options[1]?.hint ?? '', /required by shared\/review/);
    assert.doesNotMatch(options[0]?.hint ?? '', /required by/);
  });

  it('should flag edited, missing and orphaned artifacts', () => {
    const cases: Array<[StatusResult['status'], RegExp]> = [
      ['drifted', /edited/],
      ['missing', /missing/],
      ['orphaned', /no longer in the catalog/],
      ['outdated', /update available/],
    ];
    for (const [state, pattern] of cases) {
      const [option] = installedOptions([skill], [status(skill, state)]);
      assert.match(option?.hint ?? '', pattern, state);
    }
  });
});

describe('pickInstalled', () => {
  const entries = [entry('shared/review', 'skill'), entry('shared/git', 'rule')];

  it('should return the ids the user ticked', async () => {
    const restore = mockClack([['shared/git']]);
    try {
      assert.deepEqual(await pickInstalled({ entries, projectDir: '/nowhere', message: 'Pick' }), [
        'shared/git',
      ]);
    } finally {
      restore();
    }
  });

  it('should return null when the user cancels', async () => {
    const restore = mockClack([Symbol('cancel')]);
    try {
      assert.equal(await pickInstalled({ entries, projectDir: '/nowhere', message: 'Pick' }), null);
    } finally {
      restore();
    }
  });
});
