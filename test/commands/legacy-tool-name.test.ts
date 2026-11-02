/**
 * Tests for `legacy-tool-name` (src/commands/sync/conformance/rules/legacy-tool-name.ts) — the
 * mechanical rule that flags a tool field written in a provider's vocabulary and rewrites it to
 * the neutral one. detect()/fix() are called directly against small in-memory catalogs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { legacyToolNameRule } from '../../dist-cli/commands/sync/conformance/rules/legacy-tool-name';
import type { ConformanceContext } from '../../dist-cli/commands/sync/conformance/types';
import type { LoadedCatalog } from '../../dist-cli/types';
import { makeAgent, makeCatalog, makeSkill } from '../helpers/fixtures';

function contextFor(artifact: unknown): ConformanceContext {
  return {
    catalog: makeCatalog([artifact as Record<string, unknown>]) as unknown as LoadedCatalog,
    targets: [],
  };
}

describe('legacy-tool-name — detect', () => {
  it('flags an agent whose tools use legacy names', () => {
    const ctx = contextFor(makeAgent({ tools: ['Read', 'Grep', 'Glob'] }));
    const findings = legacyToolNameRule.detect(ctx);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ruleId, 'legacy-tool-name');
    assert.match(findings[0]?.detail ?? '', /Read → read/);
    assert.match(findings[0]?.detail ?? '', /Grep → search/);
  });

  it('flags a skill whose allowedTools use legacy names', () => {
    const ctx = contextFor(makeSkill({ allowedTools: ['Bash', 'Read', 'Grep'] }));
    assert.equal(legacyToolNameRule.detect(ctx).length, 1);
  });

  it('does not flag neutral names', () => {
    const ctx = contextFor(makeAgent({ tools: ['read', 'search'] }));
    assert.deepEqual(legacyToolNameRule.detect(ctx), []);
  });

  it('does not flag an artifact with no tool fields', () => {
    const ctx = contextFor(makeAgent());
    assert.deepEqual(legacyToolNameRule.detect(ctx), []);
  });

  it('reports one finding when both an agent tool field and its denylist carry legacy names', () => {
    const ctx = contextFor(makeAgent({ tools: ['Read'], disallowedTools: ['Write', 'Edit'] }));
    assert.equal(legacyToolNameRule.detect(ctx).length, 1);
  });
});

describe('legacy-tool-name — fix', () => {
  it('rewrites agent tools to neutral names, deduped', () => {
    const ctx = contextFor(makeAgent({ tools: ['Read', 'Grep', 'Glob'] }));
    const [finding] = legacyToolNameRule.detect(ctx);
    const edit = legacyToolNameRule.fix?.(finding!, ctx);
    assert.deepEqual(edit?.frontmatterPatch, { tools: ['read', 'search'] });
  });

  it('rewrites skill allowedTools to neutral names', () => {
    const ctx = contextFor(makeSkill({ allowedTools: ['Bash', 'Read', 'Grep'] }));
    const [finding] = legacyToolNameRule.detect(ctx);
    const edit = legacyToolNameRule.fix?.(finding!, ctx);
    assert.deepEqual(edit?.frontmatterPatch, { allowedTools: ['shell', 'read', 'search'] });
  });

  it('keeps a provider pattern as written and dedupes the rewritten list', () => {
    const ctx = contextFor(
      makeSkill({
        allowedTools: ['Bash(git log:*)', 'Read', 'read'],
      }),
    );
    const [finding] = legacyToolNameRule.detect(ctx);
    const edit = legacyToolNameRule.fix?.(finding!, ctx);
    assert.deepEqual(edit?.frontmatterPatch, { allowedTools: ['Bash(git log:*)', 'read'] });
  });

  it('patches every field that holds a legacy name in one edit', () => {
    const ctx = contextFor(makeAgent({ tools: ['Read'], disallowedTools: ['Write', 'Edit'] }));
    const [finding] = legacyToolNameRule.detect(ctx);
    const edit = legacyToolNameRule.fix?.(finding!, ctx);
    assert.deepEqual(edit?.frontmatterPatch, { tools: ['read'], disallowedTools: ['edit'] });
  });
});
