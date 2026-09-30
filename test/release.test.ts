/**
 * Tests for src/release.ts — version bumping and changelog promotion.
 * All pure functions; no filesystem I/O.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bumpVersion, promoteChangelog } from '../dist-cli/release';

describe('bumpVersion', () => {
  it('bumps patch', () => assert.equal(bumpVersion('0.1.0', 'patch'), '0.1.1'));
  it('bumps minor (resets patch)', () => assert.equal(bumpVersion('0.1.5', 'minor'), '0.2.0'));
  it('bumps major (resets minor + patch)', () =>
    assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0'));
  it('passes through explicit version', () => assert.equal(bumpVersion('0.1.0', '1.5.0'), '1.5.0'));
  it('throws on non-semver current', () => {
    assert.throws(() => bumpVersion('not-semver', 'patch'), /not valid semver/);
  });
  it('throws on unknown level', () => {
    assert.throws(() => bumpVersion('1.0.0', 'beta'), /Unknown release level/);
  });
});

describe('promoteChangelog', () => {
  const base = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '- new thing',
    '',
    '## [0.1.0] - 2026-01-01',
    '',
    '### Added',
    '- initial release',
  ].join('\n');

  it('inserts new version heading after [Unreleased]', () => {
    const result = promoteChangelog(base, '0.2.0', '2026-06-22');
    const lines = result.split('\n');
    const unreleasedIdx = lines.findIndex(l => l === '## [Unreleased]');
    assert.ok(unreleasedIdx >= 0, '[Unreleased] still present');
    // The new version heading should appear after [Unreleased] and an empty line
    const newHeadingIdx = lines.findIndex(l => l === '## [0.2.0] - 2026-06-22');
    assert.ok(newHeadingIdx > unreleasedIdx, 'new version heading after [Unreleased]');
  });

  it('preserves existing content', () => {
    const result = promoteChangelog(base, '0.2.0', '2026-06-22');
    assert.ok(result.includes('## [0.1.0] - 2026-01-01'), 'prior release preserved');
    assert.ok(result.includes('- new thing'), 'unreleased content preserved');
    assert.ok(result.includes('- initial release'), 'prior release content preserved');
  });

  it('throws when [Unreleased] is missing', () => {
    const noUnreleased = '# Changelog\n\n## [0.1.0] - 2026-01-01\n\n### Added\n- thing\n';
    assert.throws(() => promoteChangelog(noUnreleased, '0.2.0', '2026-06-22'), /Unreleased/);
  });
});
