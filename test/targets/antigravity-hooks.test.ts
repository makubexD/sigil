/**
 * Antigravity hook config: the target writes hooks into `.agents/hooks.json` (project) and
 * `~/.gemini/config/hooks.json` (user) through the same merge machinery as Cursor's hooks, but
 * with Antigravity's own shape — a fragment keyed by hook name, and two entry shapes
 * (docs/plan-antigravity-target-e.md, decision 4).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  antigravityHookSkipReason,
  buildAntigravityHookOps,
} from '../../dist-cli/targets/antigravity/hook-ops';
import { SigilError } from '../../dist-cli/errors';
import type { Artifact, ConfigMergeOp, ConfigScope } from '../../dist-cli/types';

const HOOK_FILE = '.agents/hooks.json';
const PLATFORMS_HINT =
  "Add 'platforms:' without 'antigravity' so this hook is not installed there.";
// Antigravity's `edit`: the documented names and the observed ones (decision 1).
const EDIT_NAMES =
  'write_to_file|replace_file_content|multi_replace_file_content|write_file|edit_file';

interface FakeArtifact {
  id: string;
  kind: string;
  filePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

/** A hook artifact with the fixture's base frontmatter, plus any per-case overrides. */
function makeHook(overrides: Record<string, unknown> = {}, id = 'shared/x'): FakeArtifact {
  const frontmatter: Record<string, unknown> = {
    kind: 'hook',
    title: 'Test Hook',
    description: 'Test',
    event: 'before-tool',
    matcher: 'edit',
    command: 'node',
    args: ['-e', 'x'],
    ...overrides,
  };
  // An explicit `undefined` override means "this key is absent", not "set to undefined".
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined) delete frontmatter[key];
  }
  return { id, kind: 'hook', filePath: '/fake/hook.md', frontmatter, body: '' };
}

/** A script hook, with no `command`/`args`, over the fixture's base frontmatter. */
function makeScriptHook(
  script: string,
  overrides: Record<string, unknown> = {},
  id = 'shared/x',
): FakeArtifact {
  return makeHook({ command: undefined, args: undefined, script, ...overrides }, id);
}

const asArtifact = (artifact: FakeArtifact): Artifact => artifact as unknown as Artifact;

/** The single op a hook renders. */
function onlyOp(artifact: Artifact, scope: ConfigScope = 'project'): ConfigMergeOp {
  const ops = buildAntigravityHookOps(artifact, scope);
  assert.equal(ops.length, 1, 'one op per hook');
  return ops[0]!;
}

/** The one hook name at the fragment's root. */
function hookName(op: ConfigMergeOp): string {
  const names = Object.keys(op.fragment);
  assert.equal(names.length, 1, 'exactly one hook-name key');
  return names[0]!;
}

/** The one event key under the hook name. */
function eventName(op: ConfigMergeOp): string {
  const events = op.fragment[hookName(op)] as Record<string, unknown>;
  const names = Object.keys(events);
  assert.equal(names.length, 1, 'exactly one event key');
  return names[0]!;
}

/** The one entry in the fragment's one event. */
function hookEntry(op: ConfigMergeOp): Record<string, unknown> {
  const events = op.fragment[hookName(op)] as Record<string, Record<string, unknown>[]>;
  const entries = events[eventName(op)]!;
  assert.equal(entries.length, 1, 'one entry per event');
  return entries[0]!;
}

/** The handler(s) inside a tool event's `hooks` wrapper. */
function handlers(entry: Record<string, unknown>): Record<string, unknown>[] {
  const list = entry.hooks as Record<string, unknown>[];
  assert.ok(Array.isArray(list), 'a tool entry carries a hooks array');
  return list;
}

// ── entry shapes ──────────────────────────────────────────────────────────────

describe('Antigravity hook entries', () => {
  it('writes a tool event keyed by hook name, wrapped with the matcher and handler', () => {
    const artifact = asArtifact(makeScriptHook('process.exitCode = 0;'));
    const op = onlyOp(artifact);

    assert.equal(op.file, HOOK_FILE);
    assert.equal(op.root, 'project');
    assert.equal(hookName(op), 'shared-x');
    assert.equal(eventName(op), 'PreToolUse');
    assert.deepEqual(op.strategy, {}, 'the hook-name key keeps the default object-spread');

    const entry = hookEntry(op);
    assert.equal(entry.matcher, EDIT_NAMES);
    const [handler] = handlers(entry);
    assert.equal(handler!.type, 'command');
    assert.match(handler!.command as string, /^node -e /);
    assert.ok(!('timeout' in handler!), 'no timeout key');
  });

  it('carries timeout inside the wrapper handler', () => {
    const artifact = asArtifact(makeScriptHook('process.exitCode = 0;', { timeout: 10 }));
    const [handler] = handlers(hookEntry(onlyOp(artifact)));
    assert.equal(handler!.timeout, 10);
  });

  it('omits matcher for every tool, whether `*` or absent', () => {
    for (const matcher of ['*', undefined]) {
      const artifact = asArtifact(makeHook({ matcher }));
      assert.ok(!('matcher' in hookEntry(onlyOp(artifact))), `no matcher key for ${matcher}`);
    }
  });

  it('writes a non-tool event as the handler directly, with no wrapper or matcher', () => {
    const artifact = asArtifact(
      makeHook({
        event: 'session-start',
        matcher: undefined,
        command: './check.sh',
        args: ['--strict'],
      }),
    );
    const op = onlyOp(artifact);
    assert.equal(eventName(op), 'SessionStart');
    assert.deepEqual(hookEntry(op), { type: 'command', command: './check.sh --strict' });
  });

  it('maps stop to Stop', () => {
    const artifact = asArtifact(makeHook({ event: 'stop', matcher: undefined }));
    assert.equal(eventName(onlyOp(artifact)), 'Stop');
  });
});

// ── refusals ──────────────────────────────────────────────────────────────────

describe('Antigravity hook skip reasons', () => {
  for (const event of ['prompt-submit', 'subagent-stop', 'notification']) {
    it(`refuses ${event} with the event refusal, and throws it`, () => {
      const artifact = asArtifact(makeHook({ event, matcher: undefined }));
      const reason = antigravityHookSkipReason(artifact);
      assert.ok(reason !== undefined, 'a skip names its reason');
      assert.ok(reason.includes(`Antigravity has no '${event}' hook event to map to`), reason);
      assert.ok(reason.endsWith(PLATFORMS_HINT), reason);
      assert.throws(
        () => buildAntigravityHookOps(artifact, 'project'),
        (err: Error) => err instanceof SigilError && err.message === reason,
      );
    });
  }

  it('accepts `*` on a non-tool event, since it names every call anyway', () => {
    const artifact = asArtifact(makeHook({ event: 'session-start', matcher: '*' }));
    assert.equal(antigravityHookSkipReason(artifact), undefined);
    assert.ok(!('matcher' in hookEntry(onlyOp(artifact))), 'no matcher key');
  });

  it('refuses a matcher on a non-tool event', () => {
    const artifact = asArtifact(makeHook({ event: 'session-start', matcher: 'edit' }));
    const reason = antigravityHookSkipReason(artifact) ?? '';
    assert.match(reason, /applies a matcher only to PreToolUse and PostToolUse/);
    assert.ok(reason.endsWith(PLATFORMS_HINT), reason);
  });

  it('names the neutral tool Antigravity has no hook name for', () => {
    const artifact = asArtifact(makeHook({ matcher: 'todo' }));
    const reason = antigravityHookSkipReason(artifact) ?? '';
    assert.match(reason, /'todo'/);
    assert.ok(reason.endsWith(PLATFORMS_HINT), reason);
  });
});

// ── destinations ──────────────────────────────────────────────────────────────

describe('Antigravity hook destinations', () => {
  it('user scope writes .gemini/config/hooks.json under home', () => {
    const op = onlyOp(asArtifact(makeHook()), 'user');
    assert.equal(op.file, '.gemini/config/hooks.json');
    assert.equal(op.root, 'home');
  });

  it('refuses local scope, naming project and user', () => {
    assert.throws(
      () => buildAntigravityHookOps(asArtifact(makeHook()), 'local'),
      (err: Error) => {
        assert.ok(err instanceof SigilError);
        assert.match(err.message, /project/);
        assert.match(err.message, /user/);
        return true;
      },
    );
  });
});

// ── legacy aliases ────────────────────────────────────────────────────────────

describe('Antigravity hook legacy aliases', () => {
  it('renders PreToolUse + Edit|Write the same entry as before-tool + edit', () => {
    const script = 'process.exitCode = 0;';
    const legacy = asArtifact(
      makeScriptHook(script, { event: 'PreToolUse', matcher: 'Edit|Write' }),
    );
    const neutral = asArtifact(makeScriptHook(script, { event: 'before-tool', matcher: 'edit' }));
    assert.deepEqual(hookEntry(onlyOp(legacy)), hookEntry(onlyOp(neutral)));
  });
});

// ── the composed script ───────────────────────────────────────────────────────

/** Runs a hook command string through `sh -c`, with the test's own node first on PATH. */
function runCommandLine(
  commandLine: string,
  stdin: string,
): { status: number | null; stdout: string } {
  const nodeDir = path.dirname(process.execPath);
  const env = { ...process.env, PATH: `${nodeDir}${path.delimiter}${process.env.PATH ?? ''}` };
  const r = spawnSync('sh', ['-c', commandLine], { input: stdin, encoding: 'utf8', env });
  return { status: r.status, stdout: r.stdout };
}

describe('Antigravity hook composed script', () => {
  it('normalizes Antigravity stdin into the neutral input', () => {
    const artifact = asArtifact(
      makeScriptHook('process.stdout.write(JSON.stringify(input));', {
        event: 'before-tool',
        matcher: 'edit',
      }),
    );
    const [handler] = handlers(hookEntry(onlyOp(artifact)));
    const payload = JSON.stringify({ toolCall: { name: 'write_file', args: { Path: '/r/.env' } } });

    const result = runCommandLine(handler!.command as string, payload);
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      event: 'before-tool',
      tool: 'edit',
      files: ['/r/.env'],
    });
  });
});
