/**
 * The plan box shows the plugin-overlap warning `sigil add` prints, in the same words.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pluginOverlapAdviceLines } from '../../dist-cli/wizard/command-strings';
import { pluginOverlapLines } from '../../dist-cli/wizard/steps/add/plan-box';
import type { PlanView } from '../../dist-cli/wizard/steps/add/plan-box';
import { previewPluginOverlaps } from '../../dist-cli/wizard/steps/add/plan-preview';
import { formatPluginOverlap } from '../../dist-cli/plugin-overlap';
import type { PluginOverlap } from '../../dist-cli/plugin-overlap';
import type { AddWizardState } from '../../dist-cli/wizard/steps/add/state';
import { getTarget } from '../../dist-cli/targets';

const ID = 'shared/git';
const OVERLAP: PluginOverlap = {
  plugin: 'core',
  marketplace: 'sigil',
  source: '~/.claude/settings.json',
};

const viewOf = (pluginOverlaps: ReadonlyMap<string, PluginOverlap>): PlanView => ({
  closure: { primary: [], dependencies: [] } as unknown as PlanView['closure'],
  skipped: [],
  upToDate: new Set(),
  writeCount: 1,
  pluginOverlaps,
});

describe('plan box plugin overlap lines', () => {
  it('should repeat the add advisory after a blank line, in the same words', () => {
    const overlaps = new Map([[ID, OVERLAP]]);
    const lines = pluginOverlapLines(viewOf(overlaps));
    assert.equal(lines[0], '');
    assert.ok(
      lines.includes(
        '1 artifact(s) an enabled plugin already delivers (installed anyway; --complement skips them):',
      ),
    );
    assert.ok(lines.includes(`  ${formatPluginOverlap(ID, OVERLAP)}`));
    assert.deepEqual(lines.slice(1), pluginOverlapAdviceLines(overlaps));
  });

  it('should show nothing when no pick overlaps a plugin', () => {
    assert.deepEqual(pluginOverlapLines(viewOf(new Map())), []);
  });

  it('should find no overlaps when the context has no plugin reader', () => {
    const state = {
      ctx: {
        catalog: {},
        packs: [],
        detectedTarget: 'claude',
        projectDir: '.',
        scaffoldableTargets: [getTarget('claude')],
      },
      target: 'claude',
    } as unknown as AddWizardState;
    assert.deepEqual(previewPluginOverlaps(state, [ID]), new Map());
  });
});
