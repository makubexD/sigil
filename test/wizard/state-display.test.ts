/**
 * Tests for src/wizard/state-display.ts — stateHintSuffix and renderStateLegend.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stateHintSuffix, renderStateLegend } from '../../dist-cli/wizard';
import type { ArtifactInstallState } from '../../dist-cli/install-state';
import { stripAnsi } from '../helpers/ansi';

describe('Q — stateHintSuffix + renderStateLegend', () => {
  describe('stateHintSuffix', () => {
    it('returns a string containing "new" for undefined (catalog-only artifact)', () => {
      assert.ok(stripAnsi(stateHintSuffix(undefined)).includes('new'));
    });

    it('returns a string containing "new" for state "new"', () => {
      assert.ok(stripAnsi(stateHintSuffix('new')).includes('new'));
    });

    it('returns a string containing "installed" for state "up-to-date"', () => {
      assert.ok(stripAnsi(stateHintSuffix('up-to-date')).includes('installed'));
    });

    it('returns a string containing "edited" for state "drifted"', () => {
      assert.ok(stripAnsi(stateHintSuffix('drifted')).includes('edited'));
    });

    it('returns a string containing "version" for state "outdated"', () => {
      assert.ok(stripAnsi(stateHintSuffix('outdated')).includes('version'));
    });

    it('returns a string containing "missing" for state "missing"', () => {
      assert.ok(stripAnsi(stateHintSuffix('missing')).includes('missing'));
    });

    it('returns a string containing "sigil" for state "foreign"', () => {
      assert.ok(stripAnsi(stateHintSuffix('foreign')).includes('sigil'));
    });

    it('all defined states return distinct non-empty strings; undefined maps same as "new"', () => {
      // undefined means "no manifest data — treat as new"; it intentionally maps to the
      // same marker as 'new'. Test distinctness only for the defined states.
      const definedStates = [
        'new',
        'up-to-date',
        'drifted',
        'outdated',
        'missing',
        'foreign',
      ] as const;
      const seen = new Set<string>();
      for (const st of definedStates) {
        const result = stripAnsi(stateHintSuffix(st));
        assert.ok(result.length > 0, `stateHintSuffix('${st}') must not be empty`);
        assert.ok(!seen.has(result), `stateHintSuffix('${st}') must be distinct from all others`);
        seen.add(result);
      }
      // undefined and 'new' share the same marker (both mean "nothing installed yet").
      assert.equal(
        stripAnsi(stateHintSuffix(undefined)),
        stripAnsi(stateHintSuffix('new')),
        'undefined and "new" must produce the same marker (both mean: nothing installed)',
      );
    });
  });

  describe('renderStateLegend', () => {
    it('returns empty string when installStates is undefined', () => {
      const items = [{ id: 'shared/clean-code' }];
      assert.equal(renderStateLegend(items, undefined), '');
    });

    it('returns empty string when items array is empty', () => {
      const states = new Map<string, ArtifactInstallState>();
      assert.equal(renderStateLegend([], states), '');
    });

    it('returns empty string when all items are "new" (nothing installed yet)', () => {
      const states = new Map<string, ArtifactInstallState>([
        ['shared/clean-code', { id: 'shared/clean-code', kind: 'rule', state: 'new' }],
        ['shared/code-reviewer', { id: 'shared/code-reviewer', kind: 'agent', state: 'new' }],
      ]);
      const items = [{ id: 'shared/clean-code' }, { id: 'shared/code-reviewer' }];
      assert.equal(
        renderStateLegend(items, states),
        '',
        'no legend needed when all are new (first-run destination)',
      );
    });

    it('returns empty string when item has no entry in installStates (treated as new)', () => {
      const states = new Map<string, ArtifactInstallState>();
      const items = [{ id: 'shared/clean-code' }];
      assert.equal(renderStateLegend(items, states), '');
    });

    it('returns non-empty legend when at least one item is "up-to-date"', () => {
      const states = new Map<string, ArtifactInstallState>([
        ['shared/clean-code', { id: 'shared/clean-code', kind: 'rule', state: 'up-to-date' }],
      ]);
      const items = [{ id: 'shared/clean-code' }];
      const legend = renderStateLegend(items, states);
      assert.ok(legend.length > 0, 'legend must be non-empty when an installed item is present');
      assert.ok(stripAnsi(legend).includes('installed'), 'legend must mention "installed" state');
      assert.ok(
        stripAnsi(legend).includes('pre-checked'),
        'legend must state that nothing is pre-checked',
      );
    });

    it('returns non-empty legend when at least one item is "drifted"', () => {
      const states = new Map<string, ArtifactInstallState>([
        ['shared/clean-code', { id: 'shared/clean-code', kind: 'rule', state: 'drifted' }],
      ]);
      const legend = renderStateLegend([{ id: 'shared/clean-code' }], states);
      assert.ok(legend.length > 0, 'legend must be non-empty when a drifted item is present');
    });

    it('returns non-empty legend when at least one item is "foreign"', () => {
      const states = new Map<string, ArtifactInstallState>([
        ['shared/clean-code', { id: 'shared/clean-code', kind: 'rule', state: 'foreign' }],
      ]);
      const legend = renderStateLegend([{ id: 'shared/clean-code' }], states);
      assert.ok(legend.length > 0, 'legend must be non-empty when a foreign item is present');
    });

    it('returns non-empty legend when at least one item is "outdated"', () => {
      const states = new Map<string, ArtifactInstallState>([
        ['shared/clean-code', { id: 'shared/clean-code', kind: 'rule', state: 'outdated' }],
      ]);
      const legend = renderStateLegend([{ id: 'shared/clean-code' }], states);
      assert.ok(legend.length > 0, 'legend must be non-empty when an outdated item is present');
    });

    it('mixed items: legend shown when at least one non-new item exists', () => {
      const states = new Map<string, ArtifactInstallState>([
        ['shared/clean-code', { id: 'shared/clean-code', kind: 'rule', state: 'new' }],
        [
          'shared/code-reviewer',
          { id: 'shared/code-reviewer', kind: 'agent', state: 'up-to-date' },
        ],
      ]);
      const items = [{ id: 'shared/clean-code' }, { id: 'shared/code-reviewer' }];
      const legend = renderStateLegend(items, states);
      assert.ok(
        legend.length > 0,
        'legend must appear when any item is non-new even if others are new',
      );
    });
  });
});
