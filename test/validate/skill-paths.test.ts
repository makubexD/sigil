/**
 * Skill-local path check: a skill's SKILL.md and references/*.md may only point at bundled files
 * that actually ship with it (`references/<file>`), and never at `assets/`/`scripts/`, which the
 * loader doesn't read, so no target emits them.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkSkillPaths } from '../../dist-cli/validate/skill-path-check';
import type { ValidateCtx } from '../../dist-cli/validate/types';
import { makeCatalog, makeSkill } from '../helpers/fixtures';

function warningsFor(body: string, references: { name: string; content: string }[] = []): string[] {
  const skill = { ...makeSkill(), body, references };
  const ctx = {
    catalog: makeCatalog([skill]),
    knownTargets: undefined,
    errors: [],
    warnings: [],
  } as unknown as ValidateCtx;
  checkSkillPaths(ctx, skill as never);
  return ctx.warnings;
}

describe('checkSkillPaths', () => {
  it('passes when every referenced file ships with the skill', () => {
    const refs = [
      { name: 'grammar.md', content: 'See `references/grammar.md` and `references/…`.' },
    ];
    assert.deepEqual(
      warningsFor('Load `references/grammar.md`, then `src/` and `tests/`.', refs),
      [],
    );
  });

  it('warns on a missing reference, in SKILL.md or in a reference file', () => {
    const refs = [{ name: 'a.md', content: 'Then `references/stacks/node.md`.' }];
    const warnings = warningsFor('Load `references/missing.md`.', refs);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0]!, /SKILL\.md.*references\/missing\.md/);
    assert.match(warnings[1]!, /references\/a\.md.*references\/stacks\/node\.md/);
  });

  it('warns on assets/ and scripts/ paths, which are not shipped', () => {
    const warnings = warningsFor('Copy `assets/cli-rules.md` and run `scripts/check.sh`.');
    assert.equal(warnings.length, 2);
  });

  it('ignores placeholders and globs', () => {
    assert.deepEqual(warningsFor('Pick `references/stack-<lang>.md` or `references/*.md`.'), []);
  });
});
