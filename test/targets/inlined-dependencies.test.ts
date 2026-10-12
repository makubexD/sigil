/**
 * A `uses:` dependency the skill's spec already copies into SKILL.md (BodySectionSpec.inlines) is
 * not installed again as its own file: both Copilot products loaded such a rule twice
 * (docs/audits/2026-10-12). Every dependency path must agree, on every registered target: the
 * scaffold output (`add`), the closure (`add` preview, wizard, `update`'s missing deps).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAllTargets } from '../../dist-cli/targets/index';
import { computeClosure } from '../../dist-cli/select/index';
import { isInstallableDependency } from '../../dist-cli/targets/capabilities';
import { inlinedDependencies } from '../../dist-cli/commands/shared/inlined-deps';
import { getTarget } from '../../dist-cli/targets/index';
import { loadResolvedCatalog } from '../helpers/catalog';

const OPTS = { projectDir: '/fake' };
const SKILL = 'csharp/cs-generate-tests';
const RULE = 'csharp/cs-testing';

describe('inlined dependencies', () => {
  for (const target of getAllTargets()) {
    it(`${target.name}: scaffold and closure agree on the used rule`, async () => {
      const resolved = await loadResolvedCatalog();
      if (!target.scaffold || !resolved.byId.has(SKILL)) return;
      const withDeps = await target.scaffold(SKILL, resolved, OPTS);
      const ruleOnly = isInstallableDependency(target, 'rule')
        ? await target.scaffold(RULE, resolved, { ...OPTS, includeDeps: false })
        : {};
      const rulePaths = Object.keys(ruleOnly);
      const scaffolded = rulePaths.length > 0 && rulePaths.every(p => p in withDeps);
      const inClosure = computeClosure([SKILL], resolved, target).dependencies.some(
        d => d.artifact.id === RULE,
      );
      assert.equal(scaffolded, isInstallableDependency(target, 'rule'), 'scaffold');
      assert.equal(inClosure, isInstallableDependency(target, 'rule'), 'closure');
    });
  }

  it('copilot inlines rules into the skill; claude installs them as files', () => {
    const byName = new Map(getAllTargets().map(t => [t.name, t]));
    assert.equal(isInstallableDependency(byName.get('copilot')!, 'rule'), false);
    assert.equal(isInstallableDependency(byName.get('claude')!, 'rule'), true);
    assert.equal(isInstallableDependency(byName.get('copilot')!, 'agent'), true);
  });
});

describe('inlinedDependencies (prune / update)', () => {
  const entry = (id: string, kind: string, dependentOf: string[]) =>
    ({
      id,
      kind,
      target: 'copilot',
      files: [],
      dependentOf,
      sigilVersion: '0',
      installedAt: '',
    }) as never;

  it('flags a rule its installed parent still inlines', async () => {
    const resolved = await loadResolvedCatalog();
    const entries = [entry(SKILL, 'skill', []), entry(RULE, 'rule', [SKILL])];
    const ids = inlinedDependencies(entries, getTarget('copilot'), resolved).map(e => e.id);
    assert.deepEqual(ids, [RULE]);
  });

  it('keeps a rule whose parent no longer lists it in uses.rules', async () => {
    const resolved = await loadResolvedCatalog();
    const other = 'shared/clean-code';
    const entries = [entry(SKILL, 'skill', []), entry(other, 'rule', [SKILL])];
    assert.deepEqual(inlinedDependencies(entries, getTarget('copilot'), resolved), []);
  });

  it('keeps every rule on a target that installs rules as files', async () => {
    const resolved = await loadResolvedCatalog();
    const entries = [entry(SKILL, 'skill', []), entry(RULE, 'rule', [SKILL])];
    assert.deepEqual(inlinedDependencies(entries, getTarget('claude'), resolved), []);
  });
});
