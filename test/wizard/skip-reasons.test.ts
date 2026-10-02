/**
 * An artifact left out of an install because another pick already carries it (a base rule inlined
 * through `extends`) is not "unsupported by the tool". The plan box and the summary line say which.
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

const viewOf = (skipped: SkippedArtifact[]): PlanView => ({
  closure: { primary: [], dependencies: [] } as unknown as PlanView['closure'],
  skipped,
  upToDate: new Set(),
  writeCount: 0,
});
const planOf = (skipped: SkippedArtifact[]): AddPlan =>
  ({ skipped, targetName: 'claude' }) as unknown as AddPlan;

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

  it('should report both, and nothing when nothing was skipped', () => {
    assert.equal(
      skippedSummary(planOf([INLINED, NO_HOOKS])),
      ", 1 artifact(s) not supported by 'claude', 1 already included in another artifact",
    );
    assert.equal(skippedSummary(planOf([])), '');
  });
});
