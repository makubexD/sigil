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

/** A minimal fake hook artifact, matching the fixture style above. */
function makeHook(fmOverrides: Record<string, unknown> = {}) {
  return {
    id: 'shared/test-hook',
    kind: 'hook',
    filePath: '/catalog/shared/hooks/test-hook.hook.md',
    frontmatter: {
      id: 'shared/test-hook',
      kind: 'hook',
      event: 'before-tool',
      script: 'return 0;',
      ...fmOverrides,
    },
    body: '',
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

  it('flags a hook whose event is a legacy alias', () => {
    const ctx = contextFor(makeHook({ event: 'PreToolUse' }));
    const findings = legacyToolNameRule.detect(ctx);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ruleId, 'legacy-tool-name');
    assert.match(findings[0]?.detail ?? '', /event PreToolUse → before-tool/);
  });

  it('flags a hook whose matcher holds legacy tool names', () => {
    const ctx = contextFor(makeHook({ matcher: 'Edit|Write|MultiEdit' }));
    const findings = legacyToolNameRule.detect(ctx);
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.detail ?? '', /matcher Edit → edit, Write → edit/);
  });

  it('does not flag a hook with a neutral event and matcher', () => {
    const ctx = contextFor(makeHook({ event: 'before-tool', matcher: 'shell|edit' }));
    assert.deepEqual(legacyToolNameRule.detect(ctx), []);
  });

  it('reports one finding when a hook has both a legacy event and matcher', () => {
    const ctx = contextFor(makeHook({ event: 'PreToolUse', matcher: 'Bash' }));
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

  it('rewrites a hook event to its neutral name', () => {
    const ctx = contextFor(makeHook({ event: 'PreToolUse' }));
    const [finding] = legacyToolNameRule.detect(ctx);
    const edit = legacyToolNameRule.fix?.(finding!, ctx);
    assert.deepEqual(edit?.frontmatterPatch, { event: 'before-tool' });
  });

  it('rewrites a hook matcher to deduped neutral tools', () => {
    const ctx = contextFor(makeHook({ matcher: 'Edit|Write|MultiEdit' }));
    const [finding] = legacyToolNameRule.detect(ctx);
    const edit = legacyToolNameRule.fix?.(finding!, ctx);
    assert.deepEqual(edit?.frontmatterPatch, { matcher: 'edit' });
  });

  it('patches a hook event and matcher in one edit', () => {
    const ctx = contextFor(makeHook({ event: 'PreToolUse', matcher: 'Bash' }));
    const [finding] = legacyToolNameRule.detect(ctx);
    const edit = legacyToolNameRule.fix?.(finding!, ctx);
    assert.deepEqual(edit?.frontmatterPatch, { event: 'before-tool', matcher: 'shell' });
  });
});
