/**
 * The neutral hook vocabulary: a catalog hook event resolves to its neutral event, a known
 * legacy alias, or `undefined`, and a matcher resolves to `all` or its neutral tools, legacy
 * aliases and unknown names. The contract is docs/decisions/neutral-hook-contract-2026-11.md.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOOK_EVENTS,
  LEGACY_HOOK_EVENT_ALIASES,
  normalizeHookEvent,
  parseHookMatcher,
  TOOL_HOOK_EVENTS,
} from '../dist-cli/hook-vocabulary';

describe('normalizeHookEvent', () => {
  it('should take a neutral event name exactly, with no legacy flag', () => {
    for (const event of HOOK_EVENTS) {
      assert.deepEqual(normalizeHookEvent(event), { event, legacy: false });
    }
  });

  it('should map a legacy alias to its neutral event and flag it', () => {
    assert.deepEqual(normalizeHookEvent('PreToolUse'), { event: 'before-tool', legacy: true });
  });

  it('should map every legacy alias to the decision 1 row', () => {
    assert.deepEqual(Object.keys(LEGACY_HOOK_EVENT_ALIASES), [
      'PreToolUse',
      'PostToolUse',
      'UserPromptSubmit',
      'SessionStart',
      'Stop',
      'SubagentStop',
      'Notification',
    ]);
    for (const [alias, event] of Object.entries(LEGACY_HOOK_EVENT_ALIASES)) {
      assert.deepEqual(normalizeHookEvent(alias), { event, legacy: true }, alias);
    }
  });

  it('should return undefined for an unknown or differently-cased name', () => {
    assert.equal(normalizeHookEvent('preToolUse'), undefined);
    assert.equal(normalizeHookEvent('PRE_TOOL_USE'), undefined);
  });

  it('should not treat an inherited Object key as an alias', () => {
    assert.equal(normalizeHookEvent('toString'), undefined);
  });
});

describe('hook event tables', () => {
  it('should list only the two tool events', () => {
    assert.deepEqual(TOOL_HOOK_EVENTS, ['before-tool', 'after-tool']);
  });

  it('should not alias a neutral event name', () => {
    for (const alias of Object.keys(LEGACY_HOOK_EVENT_ALIASES)) {
      assert.ok(!(HOOK_EVENTS as readonly string[]).includes(alias), alias);
    }
  });
});

describe('parseHookMatcher', () => {
  it('should treat undefined, empty and star as every tool', () => {
    assert.deepEqual(parseHookMatcher(undefined), { kind: 'all' });
    assert.deepEqual(parseHookMatcher(''), { kind: 'all' });
    assert.deepEqual(parseHookMatcher('*'), { kind: 'all' });
  });

  it('should parse a single neutral tool', () => {
    assert.deepEqual(parseHookMatcher('edit'), {
      kind: 'tools',
      tools: ['edit'],
      legacy: [],
      unknown: [],
    });
  });

  it('should collapse legacy aliases to their neutral tools and keep the names', () => {
    assert.deepEqual(parseHookMatcher('Edit|Write|MultiEdit'), {
      kind: 'tools',
      tools: ['edit'],
      legacy: ['Edit', 'Write', 'MultiEdit'],
      unknown: [],
    });
  });

  it('should trim each part of the matcher', () => {
    assert.deepEqual(parseHookMatcher('shell | edit'), {
      kind: 'tools',
      tools: ['shell', 'edit'],
      legacy: [],
      unknown: [],
    });
  });

  it('should report an empty part as unknown instead of dropping it', () => {
    assert.deepEqual(parseHookMatcher('edit|'), {
      kind: 'tools',
      tools: ['edit'],
      legacy: [],
      unknown: [''],
    });
    assert.deepEqual(parseHookMatcher(' | '), {
      kind: 'tools',
      tools: [],
      legacy: [],
      unknown: [''],
    });
  });

  it('should report a provider pattern as unknown', () => {
    assert.deepEqual(parseHookMatcher('mcp__.*'), {
      kind: 'tools',
      tools: [],
      legacy: [],
      unknown: ['mcp__.*'],
    });
  });
});
