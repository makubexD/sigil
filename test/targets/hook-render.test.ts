/**
 * The hook render helpers (src/targets/hook-render.ts): the matcher a target writes, the provider
 * event name, and the hook's command fields. The Claude-like `ToolDialect` below is a test-local
 * value; no target module is imported.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hookCommand, hookEventFor, renderHookMatcher } from '../../dist-cli/targets/hook-render';
import type { HookEvent } from '../../dist-cli/hook-vocabulary';
import type { NeutralTool } from '../../dist-cli/tool-vocabulary';
import type { ToolDialect } from '../../dist-cli/targets/tool-dialect';

/** A Claude-like hook tool table. */
const CLAUDE_NAMES: Readonly<Record<NeutralTool, readonly string[] | undefined>> = {
  read: ['Read'],
  search: ['Grep', 'Glob'],
  edit: ['Edit', 'Write', 'NotebookEdit'],
  shell: ['Bash'],
  web: ['WebFetch', 'WebSearch'],
  agent: ['Agent'],
  todo: ['TodoWrite'],
};

const CLAUDE_LIKE: ToolDialect = { kind: 'names', names: CLAUDE_NAMES };

/** The same table with no `web` entry, for the missing case. */
const WITHOUT_WEB: ToolDialect = { kind: 'names', names: { ...CLAUDE_NAMES, web: undefined } };

const READ_ONLY: ToolDialect = {
  kind: 'read-only-flag',
  readOnly: ['read', 'search'],
  writes: ['edit'],
};

const EVENTS: ReadonlyMap<HookEvent, string> = new Map<HookEvent, string>([
  ['before-tool', 'PreToolUse'],
  ['after-tool', 'PostToolUse'],
]);

describe('renderHookMatcher', () => {
  it('should render a neutral tool through the dialect', () => {
    assert.deepEqual(renderHookMatcher(CLAUDE_LIKE, 'edit'), {
      kind: 'names',
      matcher: 'Edit|Write|NotebookEdit',
    });
  });

  it('should treat legacy tool names as their neutral tool', () => {
    assert.deepEqual(renderHookMatcher(CLAUDE_LIKE, 'Edit|Write'), {
      kind: 'names',
      matcher: 'Edit|Write|NotebookEdit',
    });
  });

  it('should render several neutral tools in dialect order', () => {
    assert.deepEqual(renderHookMatcher(CLAUDE_LIKE, 'shell|edit'), {
      kind: 'names',
      matcher: 'Bash|Edit|Write|NotebookEdit',
    });
  });

  it('should treat * and undefined as every tool', () => {
    assert.deepEqual(renderHookMatcher(CLAUDE_LIKE, '*'), { kind: 'all' });
    assert.deepEqual(renderHookMatcher(CLAUDE_LIKE, undefined), { kind: 'all' });
  });

  it('should report a neutral tool the dialect has no name for', () => {
    assert.deepEqual(renderHookMatcher(WITHOUT_WEB, 'web'), {
      kind: 'missing',
      tools: ['web'],
    });
  });

  it('should throw for a read-only-flag dialect', () => {
    assert.throws(() => renderHookMatcher(READ_ONLY, 'edit'), /names/);
  });
});

describe('hookEventFor', () => {
  it('should map a neutral event and its legacy alias to the same name', () => {
    assert.equal(hookEventFor(EVENTS, 'before-tool'), 'PreToolUse');
    assert.equal(hookEventFor(EVENTS, 'PreToolUse'), 'PreToolUse');
  });

  it('should return undefined for an event the target does not map', () => {
    assert.equal(hookEventFor(EVENTS, 'notification'), undefined);
  });
});

describe('hookCommand', () => {
  it('should read a script hook', () => {
    assert.deepEqual(hookCommand({ script: 'return;' }), { kind: 'script', script: 'return;' });
  });

  it('should read a command hook with args', () => {
    assert.deepEqual(hookCommand({ command: 'node', args: ['-e', 'x'] }), {
      kind: 'command',
      command: 'node',
      args: ['-e', 'x'],
    });
  });

  it('should throw when neither script nor command is set', () => {
    assert.throws(() => hookCommand({}), /exactly one/);
  });
});
