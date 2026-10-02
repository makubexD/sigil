/**
 * Install wizard guidance for a first-timer: pressing Enter on an empty list asks again instead of
 * silently going back, "Everything" must be confirmed, the plan only counts what the chosen tool
 * can take, and "replace existing files?" is asked only when something would be replaced.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../../dist-cli/load';
import { resolveCatalog } from '../../dist-cli/resolve';
import { getAllTargets } from '../../dist-cli/targets';
import { artifactLanguage, hasLanguageChoice, buildLanguageOptions } from '../../dist-cli/select';
import { BACK } from '../../dist-cli/wizard/steps/add/state';
import type { AddWizardState } from '../../dist-cli/wizard/steps/add/state';
import { pickUntilUsable } from '../../dist-cli/wizard/steps/add/pick';
import { scopeStep } from '../../dist-cli/wizard/steps/add/scope';
import { overwriteStep } from '../../dist-cli/wizard/steps/add/overwrite';
import { previewSelection, conflictsFor } from '../../dist-cli/wizard/steps/add/plan-preview';
import type { ArtifactInstallState } from '../../dist-cli/install-state';
import type { ResolvedCatalog } from '../../dist-cli/types';
import { CATALOG_DIR } from '../helpers/catalog';
import { createRecorder, mockClack } from '../helpers/clack-mock';
import type { MockAnswer } from '../helpers/clack-mock';
import '../../dist-cli/wizard/index';

let catalog: ResolvedCatalog;

before(async () => {
  catalog = resolveCatalog(await loadCatalog(CATALOG_DIR)) as ResolvedCatalog;
});

function state(over: Partial<AddWizardState> = {}): AddWizardState {
  return {
    ctx: {
      catalog,
      packs: [],
      detectedTarget: 'claude',
      projectDir: '/work/app',
      scaffoldableTargets: getAllTargets().filter(t => Boolean(t.scaffold)),
    },
    includeDeps: true,
    overwrite: false,
    ...over,
  };
}

const installState = (id: string, kind: string, s: ArtifactInstallState['state']) =>
  [id, { id, kind, state: s }] as const;

/** Replaces the picker with a queue of answers and records what it was asked. */
function mockPicker(answers: Array<string[] | symbol>) {
  const key = require.resolve('../../dist-cli/wizard/picker/index');
  const exports = (require.cache[key] as { exports: Record<string, unknown> }).exports;
  const original = exports['pickArtifacts'];
  const asked: Array<{ initialValues?: readonly string[] }> = [];
  exports['pickArtifacts'] = async (opts: { initialValues?: readonly string[] }) => {
    asked.push(opts);
    if (answers.length === 0) throw new Error('picker mock: answers exhausted');
    return answers.shift();
  };
  return {
    asked,
    restore: () => {
      exports['pickArtifacts'] = original;
    },
  };
}

const ROWS = { Rules: [{ kind: 'back' as const, value: BACK }, rule('a'), rule('b')] };
function rule(id: string) {
  return {
    kind: 'item' as const,
    value: `rule:${id}`,
    id,
    kindNoun: 'rule',
    stateGlyph: '',
    stateLabel: '',
    description: '',
  };
}
const ask = (initialValues: string[] = []) => ({
  message: 'm',
  options: ROWS,
  required: false,
  initialValues,
});

describe('pickUntilUsable', () => {
  async function run(answers: Array<string[] | symbol>, initial: string[] = []) {
    const picker = mockPicker(answers);
    const restore = mockClack([]);
    try {
      const result = await pickUntilUsable(ask(initial));
      return { result, asked: picker.asked };
    } finally {
      restore();
      picker.restore();
    }
  }

  it('should ask again, not go back, when nothing is ticked', async () => {
    const { result, asked } = await run([[], ['rule:a']]);
    assert.deepEqual(result, ['rule:a']);
    assert.equal(asked.length, 2);
  });

  it('should accept "← Back" on its own as a request to go back', async () => {
    const { result } = await run([[BACK]]);
    assert.deepEqual(result, [BACK]);
  });

  it('should ask again, keeping the picks, when "← Back" is ticked next to items', async () => {
    const { result, asked } = await run([
      [BACK, 'rule:a'],
      ['rule:a', 'rule:b'],
    ]);
    assert.deepEqual(result, ['rule:a', 'rule:b']);
    assert.deepEqual(asked[1]?.initialValues, ['rule:a']);
  });

  it('should pass a Ctrl+C straight through', async () => {
    const cancel = Symbol('cancel');
    const { result } = await run([cancel]);
    assert.equal(result, cancel);
  });

  it('should start with the earlier picks ticked, dropping any that are not rows here', async () => {
    const { asked } = await run([['rule:a']], ['rule:a', 'skill:gone']);
    assert.deepEqual(asked[0]?.initialValues, ['rule:a']);
  });
});

describe('scopeStep', () => {
  async function run(s: AddWizardState, answers: MockAnswer[]) {
    const seen = createRecorder();
    const restore = mockClack(answers, seen);
    try {
      const outcome = await scopeStep.run(s);
      return { outcome, initial: seen.prompts[0]?.initialValue };
    } finally {
      restore();
    }
  }

  it('should preselect "Pick specific items", never the whole catalog', async () => {
    const { initial } = await run(state(), ['browse']);
    assert.equal(initial, 'browse');
  });

  it('should ask for confirmation before choosing Everything', async () => {
    const s = state();
    await run(s, ['all', true]);
    assert.deepEqual(s.selectors, ['all']);
    assert.equal(s.scope, 'all');
  });

  it('should ask the scope again when Everything is not confirmed', async () => {
    const s = state();
    await run(s, ['all', false, 'browse']);
    assert.equal(s.scope, 'browse');
    assert.equal(s.selectors, undefined);
  });

  it('should cancel when the confirmation is cancelled', async () => {
    const { outcome } = await run(state(), ['all', Symbol('cancel')]);
    assert.equal(outcome, 'cancel');
  });

  it('should drop answers that belonged to the previous scope', async () => {
    const s = state({
      scope: 'all',
      selectors: ['all'],
      language: 'python',
      kindPick: 'skill',
      browseAll: false,
    });
    await run(s, ['browse']);
    assert.equal(s.scope, 'browse');
    assert.equal(s.language, undefined);
    assert.equal(s.selectors, undefined);
    assert.equal(s.kindPick, undefined);
    assert.equal(s.browseAll, undefined);
  });
});

describe('previewSelection', () => {
  it('should leave out what the chosen tool cannot take, and say how many', () => {
    const copilot = previewSelection(state({ target: 'copilot', selectors: ['all'] }));
    const claude = previewSelection(state({ target: 'claude', selectors: ['all'] }));
    assert.ok(copilot.skipped.length > 0, 'Copilot has no hooks/settings: some are skipped');
    assert.ok(copilot.ids.length < claude.ids.length);
  });
});

describe('overwriteStep', () => {
  const pick = (target = 'claude') => state({ target, selectors: ['rule:shared/git'] });

  it('should not be asked when nothing on disk would be replaced', () => {
    const s = { ...pick(), installStates: new Map([installState('shared/git', 'rule', 'new')]) };
    assert.equal(overwriteStep.shouldShow?.(s), false);
  });

  it('should be asked when a pick is a file the user edited or sigil did not install', () => {
    for (const kind of ['drifted', 'foreign', 'outdated'] as const) {
      const states = new Map([installState('shared/git', 'rule', kind)]);
      const s = { ...pick(), installStates: states };
      assert.equal(overwriteStep.shouldShow?.(s), true, kind);
      assert.equal(conflictsFor(s).length, 1, kind);
    }
  });

  it('should not count an up-to-date or missing pick as a conflict', () => {
    for (const kind of ['up-to-date', 'missing'] as const) {
      const states = new Map([installState('shared/git', 'rule', kind)]);
      assert.equal(conflictsFor({ ...pick(), installStates: states }).length, 0, kind);
    }
  });
});

describe('hasLanguageChoice', () => {
  const byLanguage = (language: string) =>
    catalog.artifacts.filter(a => artifactLanguage(a) === language);

  it('should not offer a language question when there is only one language', () => {
    const one = byLanguage('csharp');
    assert.ok(one.length > 0);
    assert.equal(hasLanguageChoice(one), false);
    assert.equal(buildLanguageOptions(one).length, 2); // "All languages" + csharp
  });

  it('should offer it when there are two or more', () => {
    assert.equal(hasLanguageChoice([...byLanguage('csharp'), ...byLanguage('react')]), true);
  });
});
