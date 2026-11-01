/**
 * The neutral tool vocabulary: a catalog tool name resolves to a neutral tool, a known legacy
 * alias, or `unknown`, deduped in first-seen order. The alias set is Copilot's table
 * (docs/decisions/neutral-agent-vocabulary-2026-11.md).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isNeutralTool, LEGACY_TOOL_ALIASES, normalizeTools } from '../dist-cli/tool-vocabulary';

/** Asserts all three arrays of one `normalizeTools` result. */
function assertNormalized(
  input: readonly string[],
  expected: { tools: string[]; legacy: string[]; unknown: string[] },
): void {
  const actual = normalizeTools(input);
  assert.deepEqual(actual.tools, expected.tools);
  assert.deepEqual(actual.legacy, expected.legacy);
  assert.deepEqual(actual.unknown, expected.unknown);
}

describe('normalizeTools', () => {
  it('should map legacy Claude names to neutral tools and keep the names seen', () => {
    assertNormalized(['Read', 'Grep', 'Glob'], {
      tools: ['read', 'search'],
      legacy: ['Read', 'Grep', 'Glob'],
      unknown: [],
    });
  });

  it('should take neutral names exactly, with no legacy entries', () => {
    assertNormalized(['read', 'search'], {
      tools: ['read', 'search'],
      legacy: [],
      unknown: [],
    });
  });

  it('should dedupe neutral tools in first-seen order', () => {
    assertNormalized(['Bash', 'Edit', 'Write', 'Read'], {
      tools: ['shell', 'edit', 'read'],
      legacy: ['Bash', 'Edit', 'Write', 'Read'],
      unknown: [],
    });
  });

  it('should record a legacy name even when its neutral tool was already seen', () => {
    assertNormalized(['read', 'Read'], {
      tools: ['read'],
      legacy: ['Read'],
      unknown: [],
    });
  });

  it('should put an unrecognized name in unknown', () => {
    assertNormalized(['frobnicate'], {
      tools: [],
      legacy: [],
      unknown: ['frobnicate'],
    });
  });

  it('should match legacy names case-sensitively', () => {
    assertNormalized(['READ'], {
      tools: [],
      legacy: [],
      unknown: ['READ'],
    });
  });

  it('should not treat an inherited Object key as an alias', () => {
    assertNormalized(['constructor'], {
      tools: [],
      legacy: [],
      unknown: ['constructor'],
    });
  });
});

describe('legacy alias table', () => {
  it('should map every alias to a neutral tool', () => {
    for (const value of Object.values(LEGACY_TOOL_ALIASES)) {
      assert.ok(isNeutralTool(value), value);
    }
  });

  it('should not alias a neutral name', () => {
    for (const key of Object.keys(LEGACY_TOOL_ALIASES)) {
      assert.ok(!isNeutralTool(key), key);
    }
  });
});
