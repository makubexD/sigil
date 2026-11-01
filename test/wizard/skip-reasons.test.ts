/**
 * An artifact left out of an install because another pick already carries it (a base rule inlined
 * through `extends`) is not "unsupported by the tool", and neither is one the project's overlay file
 * refused or one the target cannot render. The plan box and the summary line say which.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { skippedSummary } from '../../dist-cli/commands/add/render';
import type { AddPlan } from '../../dist-cli/commands/add/plan';
import { skippedLine } from '../../dist-cli/wizard/steps/add/plan-box';
import type { PlanView } from '../../dist-cli/wizard/steps/add/plan-box';
import type { SkippedArtifact } from '../../dist-cli/select';
import { getTarget } from '../../dist-cli/targets';

const INLINED: SkippedArtifact = {
  id: 'shared/clean-code',
  kind: 'rule',
  cause: 'inlined',
  reason: 'inlined into typescript/ts-code-quality via extends — already delivered',
};
const NO_HOOKS: SkippedArtifact = {
  id: 'shared/protect-config',
  kind: 'hook',
  cause: 'kind',
  reason: "kind 'hook' is not supported for this target",
};

const REFUSED: SkippedArtifact = {
  id: 'shared/git',
  kind: 'rule',
  cause: 'overlay',
  reason: ".sigil/overlays.yaml entry refused: scope '../x' is not a plain relative path",
};

const UNRENDERABLE: SkippedArtifact = {
  id: 'shared/notify',
  kind: 'hook',
  cause: 'unrenderable',
  reason: 'Cursor has no X event',
};

const viewOf = (skipped: SkippedArtifact[]): PlanView => ({
  closure: { primary: [], dependencies: [] } as unknown as PlanView['closure'],
  skipped,
  upToDate: new Set(),
  writeCount: 0,
});
const planOf = (skipped: SkippedArtifact[], targetName = 'claude'): AddPlan =>
  ({ skipped, targetName }) as unknown as AddPlan;

describe('plan box skip lines', () => {
  const target = getTarget('copilot');

  it('should call an inlined rule already included, not unsupported', () => {
    const lines = skippedLine(viewOf([INLINED]), target).join('\n');
    assert.match(lines, /Already included in another pick, nothing to add: shared\/clean-code\./);
    assert.doesNotMatch(lines, /does not support/);
  });

  it('should still say a tool does not support a kind it lacks', () => {
    const lines = skippedLine(viewOf([NO_HOOKS]), target).join('\n');
    assert.match(lines, /1 item skipped: GitHub Copilot does not support/);
    assert.doesNotMatch(lines, /Already included/);
  });

  it('should show both lines when both causes are present, each with only its own artifacts', () => {
    const lines = skippedLine(viewOf([INLINED, NO_HOOKS]), target).join('\n');
    assert.match(lines, /1 item skipped/);
    assert.match(lines, /nothing to add: shared\/clean-code\./);
    assert.doesNotMatch(lines, /nothing to add:.*protect-config/);
  });

  it('should name the overlay file for a rule its entry refused, not the tool', () => {
    const lines = skippedLine(viewOf([REFUSED, NO_HOOKS]), target).join('\n');
    assert.match(lines, /Skipped, \.sigil\/overlays\.yaml entry refused: shared\/git\./);
    assert.match(lines, /1 item skipped: GitHub Copilot does not support hooks?\./);
  });

  it('should say the target cannot render an artifact, with its reason, not that it lacks the kind', () => {
    const lines = skippedLine(viewOf([UNRENDERABLE]), getTarget('cursor')).join('\n');
    assert.match(lines, /Skipped, Cursor cannot render:/);
    assert.match(lines, / {2}shared\/notify: Cursor has no X event/);
    assert.doesNotMatch(lines, /does not support/);
  });

  it('should show the unsupported and unrenderable lines, each naming only its own artifact', () => {
    const lines = skippedLine(viewOf([NO_HOOKS, UNRENDERABLE]), getTarget('cursor')).join('\n');
    const unsupported = lines.split('\n').find(l => l.includes('does not support'));
    const unrenderable = lines.split('\n').find(l => l.includes('shared/notify'));
    assert.ok(unsupported);
    assert.ok(unrenderable);
    assert.doesNotMatch(unsupported, /shared\/notify/);
    assert.doesNotMatch(unrenderable, /shared\/protect-config/);
    assert.match(unrenderable, /: Cursor has no X event$/);
  });

  it('should show nothing when nothing was skipped', () => {
    assert.deepEqual(skippedLine(viewOf([]), target), []);
  });
});

describe('install summary line', () => {
  it('should count an inlined rule as already included', () => {
    assert.equal(skippedSummary(planOf([INLINED])), ', 1 already included in another artifact');
  });

  it('should count an unsupported kind as not supported by the tool', () => {
    assert.equal(skippedSummary(planOf([NO_HOOKS])), ", 1 artifact(s) not supported by 'claude'");
  });

  it('should count a rule whose overlay entry was refused apart from unsupported kinds', () => {
    assert.equal(
      skippedSummary(planOf([REFUSED, NO_HOOKS])),
      ", 1 artifact(s) not supported by 'claude', 1 skipped by .sigil/overlays.yaml",
    );
  });

  it('should count an artifact the target cannot render apart from unsupported kinds', () => {
    const summary = skippedSummary(planOf([UNRENDERABLE], 'cursor'));
    assert.equal(summary, ", 1 skipped (cannot render on 'cursor')");
    assert.doesNotMatch(summary, /not supported/);
  });

  it('should report both, and nothing when nothing was skipped', () => {
    assert.equal(
      skippedSummary(planOf([INLINED, NO_HOOKS])),
      ", 1 artifact(s) not supported by 'claude', 1 already included in another artifact",
    );
    assert.equal(skippedSummary(planOf([])), '');
  });
});
