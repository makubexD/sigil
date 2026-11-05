/**
 * Tests for src/release.ts — version bumping, changelog promotion and the release date.
 * All pure functions; no filesystem I/O.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bumpVersion, localIsoDate, promoteChangelog } from '../dist-cli/release';

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

describe('localIsoDate', () => {
  /** Runs `fn` with `TZ` set, then restores it. Node rereads `TZ` when it is assigned. */
  function inTimeZone<T>(tz: string, fn: () => T): T {
    const saved = process.env.TZ;
    process.env.TZ = tz;
    try {
      return fn();
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  }

  it('keeps the local day when UTC has already rolled over', () => {
    const lateEvening = new Date('2026-11-05T00:40:00Z'); // 19:40 on Nov 4 in Bogota
    assert.equal(
      inTimeZone('America/Bogota', () => localIsoDate(lateEvening)),
      '2026-11-04',
    );
  });

  it('zero-pads the month and day', () => {
    assert.equal(localIsoDate(new Date(2026, 0, 5, 12)), '2026-01-05');
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
