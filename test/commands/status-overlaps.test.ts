/**
 * Some tools load other tools' folders too: GitHub Copilot reads skills from `.github/skills`,
 * `.claude/skills` and `.agents/skills` (Target.alsoLoads, cited). A skill installed for Copilot and
 * for one of those targets therefore loads twice in Copilot; `sigil status` says so.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { duplicateLoads } from '../../dist-cli/commands/status-overlaps';
import { getAllTargets } from '../../dist-cli/targets/index';
import type { ManifestEntry } from '../../dist-cli/manifest/types';

const entry = (id: string, kind: string, target: string) =>
  ({ id, kind, target, files: [], sigilVersion: '0', installedAt: '' }) as unknown as ManifestEntry;

describe('duplicateLoads', () => {
  it('should note a skill installed for Copilot and for a target whose skills Copilot also reads', () => {
    const notes = duplicateLoads(
      [
        entry('shared/cli', 'skill', 'claude'),
        entry('shared/cli', 'skill', 'copilot'),
        entry('shared/wizard', 'skill', 'agents-standard'),
        entry('shared/wizard', 'skill', 'copilot'),
      ],
      getAllTargets(),
    );
    assert.equal(notes.length, 2, notes.join('\n'));
    assert.ok(notes.some(n => n.includes('shared/cli') && /Claude Code/.test(n)));
    assert.ok(notes.some(n => n.includes('shared/wizard') && /Open standard/.test(n)));
    assert.ok(
      notes.every(n => /docs\.github\.com/.test(n)),
      'each note cites its source',
    );
  });

  it('should say nothing when no reader shares an artifact with a target it reads', () => {
    const notes = duplicateLoads(
      [
        entry('shared/cli', 'skill', 'claude'),
        entry('shared/wizard', 'skill', 'copilot'),
        entry('shared/clean-code', 'rule', 'claude'),
        entry('shared/clean-code', 'rule', 'copilot'),
      ],
      getAllTargets(),
    );
    assert.deepEqual(notes, []);
  });
});
