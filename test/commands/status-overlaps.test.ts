/**
 * Some tools load other tools' folders too: GitHub Copilot reads skills from `.github/skills`,
 * `.claude/skills` and `.agents/skills` (Target.alsoLoads, cited). A skill installed for Copilot and
 * for one of those targets therefore loads twice in Copilot; `sigil status` says so.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { duplicateLoads, duplicateLoadsFor } from '../../dist-cli/commands/status-overlaps';
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

  it('should note a skill installed for Copilot and Antigravity as loading twice in Copilot', () => {
    const notes = duplicateLoads(
      [
        entry('shared/cli', 'skill', 'antigravity'),
        entry('shared/cli', 'skill', 'copilot'),
      ],
      getAllTargets(),
    );
    assert.equal(notes.length, 1, notes.join('\n'));
    assert.match(notes[0] ?? '', /GitHub Copilot also loads Antigravity's skills/);
    assert.match(notes[0] ?? '', /load twice there: shared\/cli/);
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

describe('duplicateLoads, Cursor readerWins', () => {
  it('should note a skill installed for Cursor and Claude Code as unused in Cursor', () => {
    const notes = duplicateLoads(
      [entry('x', 'skill', 'cursor'), entry('x', 'skill', 'claude')],
      getAllTargets(),
    );
    assert.equal(notes.length, 1, notes.join('\n'));
    assert.match(notes[0] ?? '', /Cursor also reads Claude Code's skills/);
    assert.match(notes[0] ?? '', /uses its own copy on a name clash/);
    assert.match(notes[0] ?? '', /Claude Code's copy of these goes unused there: x/);
  });

  it('should note a skill installed for Cursor and Codex as unused in Cursor', () => {
    const notes = duplicateLoads(
      [entry('x', 'skill', 'cursor'), entry('x', 'skill', 'codex')],
      getAllTargets(),
    );
    assert.equal(notes.length, 1, notes.join('\n'));
    assert.match(notes[0] ?? '', /Cursor also reads OpenAI Codex's skills/);
    assert.match(notes[0] ?? '', /uses its own copy on a name clash/);
    assert.match(notes[0] ?? '', /goes unused there: x/);
  });

  it('should note a skill installed for Cursor and Antigravity as unused in Cursor', () => {
    const notes = duplicateLoads(
      [entry('x', 'skill', 'cursor'), entry('x', 'skill', 'antigravity')],
      getAllTargets(),
    );
    assert.equal(notes.length, 1, notes.join('\n'));
    assert.match(notes[0] ?? '', /Cursor also reads Antigravity's skills/);
    assert.match(notes[0] ?? '', /uses its own copy on a name clash/);
    assert.match(notes[0] ?? '', /Antigravity's copy of these goes unused there: x/);
  });

  it('should say nothing when the skill is installed for Cursor only', () => {
    const notes = duplicateLoads([entry('x', 'skill', 'cursor')], getAllTargets());
    assert.deepEqual(notes, []);
  });
});

describe('duplicateLoadsFor', () => {
  it('should return the Cursor note when Claude Code is the other target and the id is shared', () => {
    const notes = duplicateLoadsFor(
      [entry('x', 'skill', 'cursor'), entry('x', 'skill', 'claude')],
      getAllTargets(),
      'claude',
      ['x'],
    );
    assert.equal(notes.length, 1, notes.join('\n'));
    assert.match(notes[0] ?? '', /Cursor also reads Claude Code's skills/);
  });

  it('should return nothing when the shared ids do not include a listed id', () => {
    const notes = duplicateLoadsFor(
      [entry('x', 'skill', 'cursor'), entry('x', 'skill', 'claude')],
      getAllTargets(),
      'cursor',
      ['y'],
    );
    assert.deepEqual(notes, []);
  });
});
