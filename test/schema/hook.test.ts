/**
 * HookSchema: the neutral event vocabulary (with its legacy aliases), the neutral tool matcher
 * and the exec form, plus the object-level rule that a hook sets exactly one of `script` and
 * `command` and that `args` needs `command`.
 * See docs/decisions/neutral-hook-contract-2026-11.md.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HookSchema } from '../../dist-cli/schema';
import { HOOK_EVENTS, LEGACY_HOOK_EVENT_ALIASES } from '../../dist-cli/hook-vocabulary';

const base = { id: 'shared/test-hook', kind: 'hook', title: 'T', description: 'd' };

const parseHook = (frontmatter: Record<string, unknown>) =>
  HookSchema.safeParse({ ...base, ...frontmatter });

/** Parses and returns the data, failing the test when the schema rejects the hook. */
const parseOk = (frontmatter: Record<string, unknown>) => {
  const result = parseHook(frontmatter);
  if (!result.success)
    assert.fail(`expected the hook to parse, got ${JSON.stringify(result.error.issues)}`);
  return result.data;
};

/** Parses and returns the issues, failing the test when the schema accepts the hook. */
const issuesOf = (frontmatter: Record<string, unknown>) => {
  const result = parseHook(frontmatter);
  assert.ok(!result.success, 'expected the hook to be rejected');
  return result.error.issues;
};

/** The first issue at `path` whose message contains `message`. */
const issueMatching = (
  frontmatter: Record<string, unknown>,
  path: readonly (string | number)[],
  message: string,
) =>
  issuesOf(frontmatter).find(
    issue =>
      issue.path.length === path.length &&
      issue.path.every((part, index) => part === path[index]) &&
      issue.message.includes(message),
  );

describe('HookSchema event, matcher and exec form', () => {
  it('should accept a neutral tool event with a neutral matcher and a script', () => {
    assert.ok(
      parseOk({
        event: 'before-tool',
        matcher: 'edit',
        script: 'process.exitCode = 0',
      }),
    );
  });

  it('should accept a legacy event alias with legacy matcher names and a command', () => {
    assert.ok(parseOk({ event: 'PreToolUse', matcher: 'Edit|Write', command: 'echo hi' }));
  });

  it('should reject a provider-specific matcher naming the unknown name', () => {
    const issues = issuesOf({ event: 'before-tool', matcher: 'mcp__.*', command: 'echo hi' });
    assert.ok(
      issues.some(
        issue =>
          issue.message.includes('`mcp__.*`') &&
          issue.message.includes('is not a neutral tool name'),
      ),
    );
  });

  it('should default an absent matcher to all tools', () => {
    const data = parseOk({ event: 'before-tool', command: 'echo hi' });
    assert.equal(data.matcher, '*');
  });

  it('should reject a hook that sets both script and command', () => {
    assert.ok(
      issueMatching(
        { event: 'before-tool', script: 'process.exitCode = 0', command: 'echo hi' },
        ['script'],
        'exactly one of `script` and `command`',
      ),
    );
  });

  it('should reject a hook that sets neither script nor command', () => {
    assert.ok(
      issueMatching({ event: 'before-tool' }, ['script'], 'exactly one of `script` and `command`'),
    );
  });

  it('should reject args without a command', () => {
    assert.ok(
      issueMatching(
        { event: 'before-tool', script: 'process.exitCode = 0', args: ['a'] },
        ['args'],
        '`args` needs `command`',
      ),
    );
  });

  it('should reject an unknown event', () => {
    const issues = issuesOf({ event: 'preToolUse', command: 'echo hi' });
    assert.ok(issues.some(issue => issue.path.length === 1 && issue.path[0] === 'event'));
  });

  it('should accept every neutral event and every legacy event alias', () => {
    for (const event of [...HOOK_EVENTS, ...Object.keys(LEGACY_HOOK_EVENT_ALIASES)])
      parseOk({ event, command: 'echo hi' });
  });

  it('should accept the exec form with args alongside a command', () => {
    assert.ok(parseOk({ event: 'before-tool', command: 'node', args: ['a'] }));
  });
});
