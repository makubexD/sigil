/**
 * A `KindEmitSpec.skipReason` lets one provider refuse an artifact the others write as-is (a
 * probe showed it ignores the file). `add` and the wizard skip it with the reason, `build` and a
 * skill's dependency closure leave it out, and a direct `scaffoldArtifact` call throws, while
 * `renderArtifact` still renders the documented form for conformance checks.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emitFile, scaffoldArtifact } from '../../dist-cli/targets/emit-files';
import { renderArtifact } from '../../dist-cli/targets/emit';
import { specSkipReason, wholeFileSkipReason } from '../../dist-cli/targets/tool-restriction';
import { CURSOR_RULE_SPEC } from '../../dist-cli/targets/cursor/spec/rule';
import { CODEX_SKILL_SPEC } from '../../dist-cli/targets/codex/spec/skill';
import { appliesToEveryFile } from '../../dist-cli/targets/shared/repo-wide-rules';
import type { KindEmitSpec } from '../../dist-cli/targets/spec-types';
import type { Target } from '../../dist-cli/types';
import { loadResolvedCatalog } from '../helpers/catalog';

/** A scoped rule (anything narrower than every file) is the artifact this fake provider refuses. */
const SCOPED_RULE_SPEC: KindEmitSpec = {
  ...CURSOR_RULE_SPEC,
  skipReason: fm =>
    appliesToEveryFile(fm.appliesTo as readonly string[] | undefined) ? undefined : 'scoped',
};

/**
 * Codex's skill spec without its rule-inlining section, so `shared/cli-rules` is treated as a
 * dependency sigil would write as its own file — which this fake provider then refuses.
 */
const NO_INLINE_RULES_SKILL_SPEC: KindEmitSpec = {
  ...CODEX_SKILL_SPEC,
  body: CODEX_SKILL_SPEC.body.filter(section => section.id !== 'codingGuidelines'),
};

const FAKE_TARGET: Pick<Target, 'emitSpecs'> = { emitSpecs: [SCOPED_RULE_SPEC] };

describe('KindEmitSpec.skipReason', () => {
  it('should report the spec reason for a scoped rule and nothing for a repo-wide one', async () => {
    const catalog = await loadResolvedCatalog();
    const scoped = catalog.byId.get('shared/cli-rules')!;
    const repoWide = catalog.byId.get('shared/clean-code')!;
    assert.equal(wholeFileSkipReason(FAKE_TARGET, scoped), 'scoped');
    assert.equal(wholeFileSkipReason(FAKE_TARGET, repoWide), undefined);
    assert.equal(specSkipReason(SCOPED_RULE_SPEC, scoped), 'scoped');
    assert.equal(specSkipReason(SCOPED_RULE_SPEC, repoWide), undefined);
  });

  it('should leave a skipped artifact out of emitFile and write a usable one', async () => {
    const catalog = await loadResolvedCatalog();
    const scoped = catalog.byId.get('shared/cli-rules')!;
    const repoWide = catalog.byId.get('shared/clean-code')!;
    const skipped: Record<string, string> = {};
    emitFile(SCOPED_RULE_SPEC, scoped, {}, skipped);
    assert.deepEqual(skipped, {});
    const written: Record<string, string> = {};
    emitFile(SCOPED_RULE_SPEC, repoWide, {}, written);
    assert.deepEqual(Object.keys(written), ['.cursor/rules/shared-clean-code.mdc']);
  });

  it('should throw from scaffoldArtifact for a directly picked skipped artifact', async () => {
    const catalog = await loadResolvedCatalog();
    const scoped = catalog.byId.get('shared/cli-rules')!;
    assert.throws(
      () =>
        scaffoldArtifact({
          specs: [SCOPED_RULE_SPEC],
          artifact: scoped,
          catalog,
          options: { projectDir: '.' },
        }),
      /shared\/cli-rules: scoped/,
    );
  });

  it('should write a skill but not its skipped rule dependency', async () => {
    const catalog = await loadResolvedCatalog();
    const skill = catalog.byId.get('shared/cli')!;
    const files = scaffoldArtifact({
      specs: [SCOPED_RULE_SPEC, NO_INLINE_RULES_SKILL_SPEC],
      artifact: skill,
      catalog,
      options: { projectDir: '.' },
    });
    assert.ok(files['.agents/skills/cli/SKILL.md']);
    assert.deepEqual(
      Object.keys(files).filter(file => file.startsWith('.cursor/rules/')),
      [],
    );
  });

  it('should still render the skipped artifact through renderArtifact', async () => {
    const catalog = await loadResolvedCatalog();
    const scoped = catalog.byId.get('shared/cli-rules')!;
    assert.match(renderArtifact(SCOPED_RULE_SPEC, scoped, {}), /globs:/);
  });
});
