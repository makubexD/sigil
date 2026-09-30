/**
 * Tests for src/config-merge/ (pure JSON merge / reverse / drift operations).
 * Covers: deepEqual, pruneEmpty, canonicalize, serialize, applyMerge, reverseMerge,
 *         detectConfigDrift and the apply→reverse round-trip invariant.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deepEqual,
  pruneEmpty,
  canonicalize,
  serialize,
  applyMerge,
  reverseMerge,
  detectConfigDrift,
  classifyConfigDrift,
} from '../dist-cli/config-merge/index';
import type { ConfigMergeOp } from '../dist-cli/types';

describe('K — Config merge (config-merge.ts)', () => {
  // ── deepEqual ─────────────────────────────────────────────────────────────────

  it('deepEqual: primitives', () => {
    assert.ok(deepEqual(1, 1));
    assert.ok(deepEqual('a', 'a'));
    assert.ok(deepEqual(null, null));
    assert.ok(!deepEqual(1, 2));
    assert.ok(!deepEqual('a', 'b'));
  });

  it('deepEqual: arrays', () => {
    assert.ok(deepEqual([1, 2], [1, 2]));
    assert.ok(!deepEqual([1, 2], [1, 3]));
    assert.ok(!deepEqual([1], [1, 2]));
  });

  it('deepEqual: objects', () => {
    assert.ok(deepEqual({ a: 1 }, { a: 1 }));
    assert.ok(!deepEqual({ a: 1 }, { a: 2 }));
    assert.ok(deepEqual({ a: { b: 1 } }, { a: { b: 1 } }));
  });

  // ── pruneEmpty ────────────────────────────────────────────────────────────────

  it('pruneEmpty removes empty arrays', () => {
    const result = pruneEmpty({ a: [], b: 'x' });
    assert.ok(!('a' in result));
    assert.equal(result.b, 'x');
  });

  it('pruneEmpty removes empty objects', () => {
    const result = pruneEmpty({ a: {}, b: 1 });
    assert.ok(!('a' in result));
  });

  it('pruneEmpty preserves non-empty values', () => {
    const result = pruneEmpty({ a: [1], b: { c: 2 } });
    assert.deepEqual(result.a, [1]);
    assert.deepEqual(result.b, { c: 2 });
  });

  // ── prototype-pollution guard ─────────────────────────────────────────────────

  it('applyMerge: drops __proto__ key — Object.prototype is not mutated', () => {
    // Arrange — JSON.parse creates an object with __proto__ as an OWN enumerable
    // property (the attack vector for prototype pollution through JSON merge paths).
    const maliciousFragment = JSON.parse('{"__proto__":{"injected":true}}') as Record<
      string,
      unknown
    >;
    const op: import('../dist-cli/types').ConfigMergeOp = {
      file: '.test.json',
      fragment: maliciousFragment,
      strategy: {},
    };

    // Act
    applyMerge({}, op);

    // Assert — neither Object.prototype nor a fresh empty object carries the injected key.
    assert.strictEqual(
      (Object.prototype as Record<string, unknown>)['injected'],
      undefined,
      'Object.prototype must not be mutated',
    );
    assert.strictEqual(
      ({} as Record<string, unknown>)['injected'],
      undefined,
      'fresh objects must not inherit the injected key',
    );
  });

  it('pruneEmpty: drops __proto__ key — Object.prototype is not mutated', () => {
    // Arrange
    const malicious = JSON.parse('{"__proto__":{"poisoned":true}}') as Record<string, unknown>;

    // Act
    pruneEmpty(malicious);

    // Assert
    assert.strictEqual(
      (Object.prototype as Record<string, unknown>)['poisoned'],
      undefined,
      'Object.prototype must not be mutated by pruneEmpty',
    );
  });

  // ── canonicalize ──────────────────────────────────────────────────────────────

  it('canonicalize sorts keys and produces stable JSON', () => {
    const out = canonicalize({ z: 1, a: 2 });
    const parsed = JSON.parse(out);
    assert.deepEqual(Object.keys(parsed), ['a', 'z']);
  });

  // ── serialize (order-preserving disk writer) ──────────────────────────────────

  it('serialize preserves key insertion order (no alphabetical sort)', () => {
    const out = serialize({ z: 1, a: 2 } as Record<string, unknown>);
    const parsed = JSON.parse(out);
    // Must be insertion order: z before a
    assert.deepEqual(Object.keys(parsed), ['z', 'a']);
  });

  it('serialize: applyMerge + serialize appends new keys after existing ones', () => {
    const existing = { b: 1, a: 2 } as Record<string, unknown>;
    const op: ConfigMergeOp = { file: '.mcp.json', fragment: { c: 3 }, strategy: {} };
    const merged = applyMerge(existing, op);
    const out = serialize(merged);
    const parsed = JSON.parse(out);
    // Existing keys b, a keep their order; new key c is appended last
    assert.deepEqual(Object.keys(parsed), ['b', 'a', 'c']);
  });

  // ── applyMerge: object-spread ─────────────────────────────────────────────────

  it('applyMerge object-spread: incoming wins per leaf', () => {
    const existing = { a: 1, b: 2 };
    const op: ConfigMergeOp = {
      file: '.mcp.json',
      fragment: { b: 99, c: 3 },
      strategy: {},
    };
    const result = applyMerge(existing as any, op);
    assert.equal(result.b, 99);
    assert.equal(result.c, 3);
    assert.equal(result.a, 1); // unchanged
  });

  it('applyMerge object-spread: deep merge nested objects', () => {
    const existing = { env: { FOO: 'a', BAR: 'b' } };
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { env: { FOO: 'overridden', NEW: 'x' } },
      strategy: { env: 'object-spread' },
    };
    const result = applyMerge(existing as any, op);
    const env = result.env as Record<string, string>;
    assert.equal(env.FOO, 'overridden');
    assert.equal(env.BAR, 'b');
    assert.equal(env.NEW, 'x');
  });

  // ── applyMerge: array-union (permissions) ─────────────────────────────────────

  it('applyMerge array-union: deduplicates and preserves existing', () => {
    const existing = { permissions: { allow: ['Bash(git status)', 'Bash(npm run lint)'] } };
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { permissions: { allow: ['Bash(npm run lint)', 'Bash(npm run test)'] } },
      strategy: { permissions: 'array-union' },
    };
    const result = applyMerge(existing as any, op);
    const allow = (result.permissions as any).allow as string[];
    assert.equal(allow.length, 3, 'union: 2 existing + 1 new = 3 (deduped lint)');
    assert.ok(allow.includes('Bash(git status)'));
    assert.ok(allow.includes('Bash(npm run lint)'));
    assert.ok(allow.includes('Bash(npm run test)'));
  });

  // ── applyMerge: array-append (hooks) ──────────────────────────────────────────

  it('applyMerge array-append: appends hook entries per event', () => {
    const existingHook = { matcher: '*', hooks: [{ type: 'command', command: 'echo existing' }] };
    const newHook = { matcher: 'Edit', hooks: [{ type: 'command', command: 'echo new' }] };
    const existing = { hooks: { PreToolUse: [existingHook] } };
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { hooks: { PreToolUse: [newHook] } },
      strategy: { hooks: 'array-append' },
    };
    const result = applyMerge(existing as any, op);
    const preToolUse = (result.hooks as any).PreToolUse as unknown[];
    assert.equal(preToolUse.length, 2, 'two hooks in PreToolUse array after append');
    assert.ok(deepEqual(preToolUse[0], existingHook));
    assert.ok(deepEqual(preToolUse[1], newHook));
  });

  it('applyMerge array-append: creates new event key when not present', () => {
    const existing = { hooks: { PostToolUse: [] } };
    const newHook = { matcher: '*', hooks: [{ type: 'command', command: 'echo new' }] };
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { hooks: { PreToolUse: [newHook] } },
      strategy: { hooks: 'array-append' },
    };
    const result = applyMerge(existing as any, op);
    const preToolUse = (result.hooks as any).PreToolUse as unknown[];
    assert.equal(preToolUse.length, 1);
  });

  // ── detectConfigDrift ─────────────────────────────────────────────────────────

  it('detectConfigDrift: no drift when fragment still present', () => {
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { model: 'claude-opus-4-8', env: { MY_VAR: 'x' } },
      strategy: {},
    };
    const live = { model: 'claude-opus-4-8', env: { MY_VAR: 'x', USER_KEY: 'y' } };
    assert.ok(!detectConfigDrift(live as any, op), 'no drift — sigil keys intact');
  });

  it('detectConfigDrift: drift when sigil value removed', () => {
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { model: 'claude-opus-4-8' },
      strategy: {},
    };
    const live = { env: { MY_VAR: 'x' } }; // model removed
    assert.ok(detectConfigDrift(live as any, op), 'drift — model removed by user');
  });

  it('detectConfigDrift: drift when sigil value changed', () => {
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { model: 'claude-opus-4-8' },
      strategy: {},
    };
    const live = { model: 'claude-sonnet-4-6' }; // user changed the model
    assert.ok(detectConfigDrift(live as any, op), 'drift — model changed');
  });

  it('detectConfigDrift: user editing their own keys is NOT drift', () => {
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { model: 'claude-opus-4-8' },
      strategy: {},
    };
    // User has their own keys; sigil's model is still intact
    const live = { model: 'claude-opus-4-8', env: { USER_KEY: 'changed' } };
    assert.ok(!detectConfigDrift(live as any, op), 'no drift — only user keys changed');
  });

  it('detectConfigDrift: array-union drift when contributed item removed', () => {
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { permissions: { allow: ['Bash(npm run *)'] } },
      strategy: { permissions: 'array-union' },
    };
    // User removed sigil's allow entry
    const live = { permissions: { allow: ['Bash(git status)'] } };
    assert.ok(detectConfigDrift(live as any, op), 'drift — contributed allow entry removed');
  });

  // ── classifyConfigDrift (F14 — docs/decisions/catalog-usage-audit-2026-08-21.md) ───────────────

  it('classifyConfigDrift: missing when the whole contributed top-level key is gone', () => {
    // The exact F14 shape: the hooks key sigil merged in is entirely absent; permissions
    // (an unrelated, untouched top-level key) is still there.
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: {
        hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'x' }] }] },
      },
      strategy: { hooks: 'array-append' },
    };
    const live = { permissions: { allow: ['Bash(npm run *)'] } };
    assert.equal(classifyConfigDrift(live as any, op), 'missing');
  });

  it('classifyConfigDrift: modified when a contributed leaf is present but changed', () => {
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { model: 'claude-opus-4-8' },
      strategy: {},
    };
    const live = { model: 'claude-sonnet-4-6' };
    assert.equal(classifyConfigDrift(live as any, op), 'modified');
  });

  it('classifyConfigDrift: missing (not modified) when one of two contributed array items is gone', () => {
    // array-union/array-append are provably non-destructive to re-apply — union dedupes, append
    // only concatenates — so a partially-present array is still safe to auto-restore, not a case
    // requiring --force the way an overwritten object-spread leaf is.
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { permissions: { allow: ['Bash(npm run *)', 'Bash(git status)'] } },
      strategy: { permissions: 'array-union' },
    };
    const live = { permissions: { allow: ['Bash(npm run *)'] } }; // one of the two survived
    assert.equal(classifyConfigDrift(live as any, op), 'missing');
  });

  it('classifyConfigDrift: modified when a sigil-owned array-union key becomes an incompatible type (round-4 audit F48)', () => {
    // A user or another tool overwrote the whole `permissions` key with a scalar instead of the
    // object-of-arrays sigil contributed. This determines --force gating (F14) and was an
    // untested branch (classifyArrayStrategy's `!isPlainObject(current) → 'modified'`) until the
    // round-4 dogfooded ts-debugger run flagged the coverage gap.
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { permissions: { allow: ['Bash(npm run *)'] } },
      strategy: { permissions: 'array-union' },
    };
    const live = { permissions: 'not-an-object' };
    assert.equal(classifyConfigDrift(live as any, op), 'modified');
  });

  it('classifyConfigDrift: modified when a sigil-owned object-spread leaf becomes an incompatible type (round-4 audit F48)', () => {
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { env: { FOO: 'a' } },
      strategy: {},
    };
    const live = { env: 'not-an-object' };
    assert.equal(classifyConfigDrift(live as any, op), 'modified');
  });

  it('classifyConfigDrift: intact when the user edits only their own keys', () => {
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { model: 'claude-opus-4-8' },
      strategy: {},
    };
    const live = { model: 'claude-opus-4-8', env: { USER_KEY: 'changed' } };
    assert.equal(classifyConfigDrift(live as any, op), 'intact');
  });

  it('classifyConfigDrift: missing for an array-strategy fragment absent entirely', () => {
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { permissions: { allow: ['Bash(npm run *)'] } },
      strategy: { permissions: 'array-union' },
    };
    const live = {}; // permissions key never existed
    assert.equal(classifyConfigDrift(live as any, op), 'missing');
  });

  it('detectConfigDrift stays true for both missing and modified (boolean wrapper unchanged)', () => {
    const missingOp: ConfigMergeOp = { file: 'x.json', fragment: { a: 1 }, strategy: {} };
    const modifiedOp: ConfigMergeOp = { file: 'x.json', fragment: { a: 1 }, strategy: {} };
    assert.ok(detectConfigDrift({} as any, missingOp));
    assert.ok(detectConfigDrift({ a: 2 } as any, modifiedOp));
  });

  // ── reverseMerge ──────────────────────────────────────────────────────────────

  it('reverseMerge: removes contributed scalar leaf', () => {
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { model: 'claude-opus-4-8' },
      strategy: {},
    };
    const live = { model: 'claude-opus-4-8', env: { USER_KEY: 'x' } };
    const result = reverseMerge(live as any, op);
    assert.ok(!('model' in result), 'model removed');
    assert.ok('env' in result, 'user env preserved');
  });

  it('reverseMerge: leaves user-modified value alone', () => {
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { model: 'claude-opus-4-8' },
      strategy: {},
    };
    // User changed the model after sigil installed it
    const live = { model: 'claude-sonnet-4-6' };
    const result = reverseMerge(live as any, op);
    // User-modified value is kept (not removed, not reset)
    assert.equal(result.model, 'claude-sonnet-4-6', 'user-modified model left intact');
  });

  it('reverseMerge: removes contributed array items (array-union)', () => {
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { permissions: { allow: ['Bash(npm run *)'] } },
      strategy: { permissions: 'array-union' },
    };
    const live = {
      permissions: { allow: ['Bash(git status)', 'Bash(npm run *)'] },
    };
    const result = reverseMerge(live as any, op);
    const allow = (result.permissions as any)?.allow as string[];
    assert.ok(allow !== undefined, 'permissions still present');
    assert.ok(!allow.includes('Bash(npm run *)'), 'sigil entry removed');
    assert.ok(allow.includes('Bash(git status)'), 'user entry preserved');
  });

  it('reverseMerge: pruneEmpty removes resulting empty containers', () => {
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { model: 'claude-opus-4-8' },
      strategy: {},
    };
    // Only sigil's key was present — result should be {}
    const live = { model: 'claude-opus-4-8' };
    const result = reverseMerge(live as any, op);
    assert.equal(Object.keys(result).length, 0, 'empty object after removing only sigil key');
  });

  // ── round-trip: apply → reverse = original ────────────────────────────────────

  it('round-trip apply→reverse restores original (object-spread)', () => {
    const original = { env: { FOO: 'a' }, someOtherKey: 'x' };
    const op: ConfigMergeOp = {
      file: '.mcp.json',
      fragment: { env: { BAR: 'b' } },
      strategy: { env: 'object-spread' },
    };
    const merged = applyMerge(original as any, op);
    const restored = reverseMerge(merged as any, op);
    // BAR should be gone; FOO and someOtherKey should remain
    assert.equal((restored.env as any)?.BAR, undefined, 'BAR removed');
    assert.equal((restored.env as any)?.FOO, 'a', 'FOO preserved');
    assert.equal(restored.someOtherKey, 'x', 'other key preserved');
  });

  it('round-trip apply→reverse restores original (array-union permissions)', () => {
    const original = { permissions: { allow: ['Bash(git status)'] } };
    const op: ConfigMergeOp = {
      file: '.claude/settings.json',
      fragment: { permissions: { allow: ['Bash(npm run *)'] } },
      strategy: { permissions: 'array-union' },
    };
    const merged = applyMerge(original as any, op);
    assert.equal((merged.permissions as any).allow.length, 2, 'merged has 2 entries');
    const restored = reverseMerge(merged as any, op);
    const allow = (restored.permissions as any)?.allow as string[];
    assert.equal(allow.length, 1, 'restored has 1 entry');
    assert.ok(allow.includes('Bash(git status)'), 'original entry preserved');
  });

  // 2026-08-22 audit F24: apply.ts/reverse.ts/drift.ts's merge/assign loops didn't apply
  // FORBIDDEN_KEYS the way primitives.ts's deepMerge/pruneEmpty already do. `JSON.parse` (not an
  // object literal, which special-cases `__proto__` as prototype assignment rather than an own
  // enumerable key) is what actually produces the exploitable own-property shape, matching how a
  // real config fragment reaches this code as parsed JSON.
  describe('prototype-pollution guard (F24)', () => {
    it('applyMerge ignores a top-level __proto__ key in the fragment', () => {
      const fragment = JSON.parse('{"__proto__":{"polluted":true},"safe":"ok"}');
      const op: ConfigMergeOp = { file: 'x.json', fragment, strategy: {} };
      const result = applyMerge({}, op);
      assert.equal(({} as any).polluted, undefined, 'Object.prototype not polluted');
      assert.equal(result.safe, 'ok', 'the safe sibling key still merges normally');
    });

    it('applyMerge ignores a __proto__ sub-key under an array-union object-of-arrays fragment', () => {
      const permissions = JSON.parse('{"__proto__":["x"],"allow":["Bash(npm run *)"]}');
      const op: ConfigMergeOp = {
        file: '.claude/settings.json',
        fragment: { permissions },
        strategy: { permissions: 'array-union' },
      };
      const result = applyMerge({}, op);
      assert.equal(({} as any).polluted, undefined, 'Object.prototype not polluted');
      assert.deepEqual((result.permissions as any).allow, ['Bash(npm run *)']);
    });

    it('reverseMerge ignores a top-level __proto__ key in the fragment', () => {
      const fragment = JSON.parse('{"__proto__":{"a":1},"safe":"ok"}');
      const op: ConfigMergeOp = { file: 'x.json', fragment, strategy: {} };
      const live = { safe: 'ok', untouched: true };
      const result = reverseMerge(live as any, op);
      assert.equal(({} as any).polluted, undefined, 'Object.prototype not polluted');
      assert.equal(result.untouched, true, 'unrelated live content untouched');
    });

    it('classifyConfigDrift ignores a top-level __proto__ key without throwing', () => {
      const fragment = JSON.parse('{"__proto__":{"a":1},"safe":"ok"}');
      const op: ConfigMergeOp = { file: 'x.json', fragment, strategy: {} };
      const drift = classifyConfigDrift({ safe: 'ok' } as any, op);
      assert.equal(drift, 'intact', 'the safe key matches; __proto__ is skipped, not scored');
    });
  });
});
