/**
 * `renderTools` is the one transform from the neutral tool vocabulary to what a target writes.
 * These cases pin the two dialect shapes: a `names` dialect expands each neutral tool in the
 * target's order and passes provider patterns through, and a `read-only-flag` dialect can only
 * say whether every authored tool is read-only.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderTools } from '../../dist-cli/targets/tool-dialect';
import type { ToolDialect } from '../../dist-cli/targets/tool-dialect';

/** `read` → Read, `search` → Grep+Glob; this provider has no tool for anything else. */
const NAMES: ToolDialect = {
  kind: 'names',
  names: {
    read: ['Read'],
    search: ['Grep', 'Glob'],
    edit: undefined,
    shell: undefined,
    web: undefined,
    agent: undefined,
    todo: undefined,
  },
};

const READ_ONLY: ToolDialect = { kind: 'read-only-flag', readOnly: ['read', 'search'] };

describe('renderTools', () => {
  it('expands neutral names in dialect order', () => {
    assert.deepEqual(renderTools(NAMES, ['read', 'search']), {
      kind: 'names',
      names: ['Read', 'Grep', 'Glob'],
      exact: true,
      missing: [],
    });
  });

  it('treats legacy names as their neutral tool', () => {
    assert.deepEqual(renderTools(NAMES, ['Read', 'Grep', 'Glob']), {
      kind: 'names',
      names: ['Read', 'Grep', 'Glob'],
      exact: true,
      missing: [],
    });
  });

  it('reports a neutral tool the dialect has no name for', () => {
    assert.deepEqual(renderTools(NAMES, ['read', 'shell']), {
      kind: 'names',
      names: ['Read'],
      exact: false,
      missing: ['shell'],
    });
  });

  it('is exact and read-only when every tool is read-only', () => {
    assert.deepEqual(renderTools(READ_ONLY, ['read', 'search']), {
      kind: 'read-only-flag',
      readOnly: true,
      exact: true,
      missing: [],
    });
  });

  it('is inexact and not read-only when a tool is not read-only', () => {
    assert.deepEqual(renderTools(READ_ONLY, ['read', 'edit']), {
      kind: 'read-only-flag',
      readOnly: false,
      exact: false,
      missing: ['edit'],
    });
  });

  it('passes provider patterns through verbatim, after the mapped names', () => {
    assert.deepEqual(renderTools(NAMES, ['Bash(git log:*)', 'read', 'mcp__github__get_issue']), {
      kind: 'names',
      names: ['Read', 'Bash(git log:*)', 'mcp__github__get_issue'],
      exact: true,
      missing: [],
    });
  });

  it('counts a provider pattern as missing under read-only-flag', () => {
    assert.deepEqual(renderTools(READ_ONLY, ['read', 'Bash(git log:*)']), {
      kind: 'read-only-flag',
      readOnly: false,
      exact: false,
      missing: ['Bash(git log:*)'],
    });
  });

  it('follows the neutral tools first-seen order and dedupes', () => {
    assert.deepEqual(renderTools(NAMES, ['search', 'read', 'Grep']), {
      kind: 'names',
      names: ['Grep', 'Glob', 'Read'],
      exact: true,
      missing: [],
    });
  });
});
