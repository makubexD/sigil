/**
 * Tests for src/commands/patch-ops.ts — flag-to-UpdateOps translation for `sigil patch`.
 * Exercises the only exported function, buildUpdateOpsFromFlags, across every flag
 * family (common / rule / uses / tool / claude) plus the splitList/toSingleton edge
 * cases those private helpers hit internally.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildUpdateOpsFromFlags, type PatchOpts } from '../../dist-cli/commands/patch-ops';

/** Minimal PatchOpts with only the required fields, overridable per test. */
function makeOpts(overrides: Partial<PatchOpts> = {}): PatchOpts {
  return { catalogDir: '/fake/catalog', yes: true, ...overrides };
}

describe('buildUpdateOpsFromFlags', () => {
  it('passes through common fields (title/description/version) unchanged', () => {
    const ops = buildUpdateOpsFromFlags(
      makeOpts({ title: 'New Title', description: 'New desc', version: '1.2.3' }),
    );
    assert.equal(ops.title, 'New Title');
    assert.equal(ops.description, 'New desc');
    assert.equal(ops.version, '1.2.3');
  });

  it('leaves common fields undefined when no matching flag was passed', () => {
    const ops = buildUpdateOpsFromFlags(makeOpts());
    assert.equal(ops.title, undefined);
    assert.equal(ops.description, undefined);
    assert.equal(ops.version, undefined);
  });

  it('wraps a single add/remove tag flag into a one-element array', () => {
    const ops = buildUpdateOpsFromFlags(makeOpts({ addTag: 'foo', removeTag: 'bar' }));
    assert.deepEqual(ops.addTags, ['foo']);
    assert.deepEqual(ops.removeTags, ['bar']);
  });

  it('splits a comma-separated setTags flag, trimming whitespace and dropping empties', () => {
    const ops = buildUpdateOpsFromFlags(makeOpts({ setTags: ' a, b ,,c ' }));
    assert.deepEqual(ops.setTags, ['a', 'b', 'c']);
  });

  it('returns undefined (not an empty array) for an omitted list flag', () => {
    const ops = buildUpdateOpsFromFlags(makeOpts());
    assert.equal(ops.setTags, undefined);
    assert.equal(ops.addTags, undefined);
  });

  it('an empty-string list flag still splits to an empty array (flag was passed)', () => {
    const ops = buildUpdateOpsFromFlags(makeOpts({ setTags: '' }));
    assert.deepEqual(ops.setTags, []);
  });

  it('builds rule-kind fields: appliesTo ops and appliesToRationale', () => {
    const ops = buildUpdateOpsFromFlags(
      makeOpts({
        addAppliesTo: '**/*.ts',
        setAppliesToRationale: 'Deliberately universal.',
        severity: 'required',
      }),
    );
    assert.deepEqual(ops.addAppliesTo, ['**/*.ts']);
    assert.equal(ops.appliesToRationale, 'Deliberately universal.');
    assert.equal(ops.severity, 'required');
  });

  it('an empty-string --set-applies-to-rationale flag passes through as empty string (clears the field)', () => {
    const ops = buildUpdateOpsFromFlags(makeOpts({ setAppliesToRationale: '' }));
    assert.equal(ops.appliesToRationale, '');
  });

  it('builds uses.rules/uses.agents ops for skill-kind fields', () => {
    const ops = buildUpdateOpsFromFlags(
      makeOpts({ setUsesRules: 'shared/clean-code, shared/git', addUsesAgent: 'shared/reviewer' }),
    );
    assert.deepEqual(ops.setUsesRules, ['shared/clean-code', 'shared/git']);
    assert.deepEqual(ops.addUsesAgents, ['shared/reviewer']);
  });

  it('builds tools/disallowedTools ops for agent-kind fields', () => {
    const ops = buildUpdateOpsFromFlags(
      makeOpts({ setTools: 'Read,Edit', removeDisallowedTool: 'Bash' }),
    );
    assert.deepEqual(ops.setTools, ['Read', 'Edit']);
    assert.deepEqual(ops.removeDisallowedTools, ['Bash']);
  });

  it('builds the claude: namespace fields verbatim, including numeric maxTurns', () => {
    const ops = buildUpdateOpsFromFlags(
      makeOpts({
        claudeModel: 'opus',
        claudeEffort: 'high',
        claudeMaxTurns: 10,
        claudeIsolation: 'worktree',
      }),
    );
    assert.equal(ops.claudeModel, 'opus');
    assert.equal(ops.claudeEffort, 'high');
    assert.equal(ops.claudeMaxTurns, 10);
    assert.equal(ops.claudeIsolation, 'worktree');
  });
});
