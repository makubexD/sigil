/**
 * Cursor hook config: the target writes hooks into `.cursor/hooks.json` (project) and
 * `~/.cursor/hooks.json` (user) through the same merge machinery as Claude Code's settings hooks,
 * Codex's hook files and Copilot's hook files.
 *
 * The entry is rendered from the provider-neutral hook contract (docs/plan-antigravity-target-h.md
 * step 10, docs/decisions/neutral-hook-contract-2026-11.md): neutral events and matchers, a
 * composed `node -e` source for a `script` hook, and a skip reason for anything Cursor cannot
 * express.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CursorTarget } from '../../dist-cli/targets/cursor';
import { buildCursorHookOps, cursorHookSkipReason } from '../../dist-cli/targets/cursor/hook-ops';
import { nodeEvalCommandLine } from '../../dist-cli/targets/shared/hook-command-line';
import { resolveSelection } from '../../dist-cli/select/selector-resolve';
import { carriedKinds, installableKinds } from '../../dist-cli/targets/capabilities';
import { SigilError } from '../../dist-cli/errors';
import { CATALOG_DIR, loadResolvedCatalog } from '../helpers/catalog';
import { withTempDir } from '../helpers/temp-dir';
import type {
  Artifact,
  ConfigMergeOp,
  ConfigScope,
  ResolvedCatalog,
  Target,
} from '../../dist-cli/types';

const PROJECT_DIR = '/abs/project';
// Cursor's `edit` covers both Write and Delete (docs/decisions/neutral-hook-contract-2026-11.md).
const EDIT_MATCHER = 'Write|Delete';
const HOOK_FILE = '.cursor/hooks.json';

interface FakeArtifact {
  id: string;
  kind: string;
  filePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

/** A hook artifact with the fixture's base frontmatter, plus any per-case overrides. */
function makeHook(overrides: Record<string, unknown> = {}, id = 'shared/test-hook'): FakeArtifact {
  const frontmatter: Record<string, unknown> = {
    kind: 'hook',
    title: 'Test Hook',
    description: 'Test',
    event: 'PreToolUse',
    matcher: 'Edit|Write',
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

/** An mcp artifact, to show scaffoldConfig refuses a kind Cursor has no writer for yet. */
function makeMcp(): FakeArtifact {
  return {
    id: 'shared/test-mcp',
    kind: 'mcp',
    filePath: '/fake/mcp.md',
    frontmatter: { kind: 'mcp', title: 'Test MCP', description: 'Test' },
    body: '',
  };
}

function makeCatalog(...artifacts: FakeArtifact[]): ResolvedCatalog {
  return {
    artifacts,
    byId: new Map(artifacts.map(a => [a.id, a])),
    languages: new Map(),
  } as unknown as ResolvedCatalog;
}

const asArtifact = (artifact: FakeArtifact): Artifact => artifact as unknown as Artifact;

const scaffold = async (
  target: Target,
  artifactId: string,
  catalog: ResolvedCatalog,
  scope: ConfigScope,
): Promise<ConfigMergeOp[]> =>
  target.scaffoldConfig!(artifactId, catalog, { projectDir: PROJECT_DIR, scope });

/** Calls scaffoldConfig with no scope option, as `add` does when the flag is absent. */
const scaffoldAtDefault = async (
  target: Target,
  artifactId: string,
  catalog: ResolvedCatalog,
): Promise<ConfigMergeOp[]> =>
  target.scaffoldConfig!(artifactId, catalog, { projectDir: PROJECT_DIR });

/** The single op a hook renders. */
function onlyOp(artifact: Artifact, scope: ConfigScope = 'project'): ConfigMergeOp {
  const ops = buildCursorHookOps(artifact, scope);
  assert.equal(ops.length, 1, 'one op per hook');
  return ops[0]!;
}

/** The only event key in the fragment (Cursor nests one event per install). */
function eventName(op: ConfigMergeOp): string {
  const hooks = op.fragment.hooks as Record<string, unknown>;
  const events = Object.keys(hooks);
  assert.equal(events.length, 1, 'exactly one event key');
  return events[0]!;
}

/** The one entry in the fragment's one event. */
function hookEntry(op: ConfigMergeOp): Record<string, unknown> {
  const hooks = op.fragment.hooks as Record<string, Record<string, unknown>[]>;
  const entries = hooks[eventName(op)]!;
  assert.equal(entries.length, 1, 'one entry per event');
  return entries[0]!;
}

/** The script inside the `node -e "eval(Buffer.from('<base64>','base64').toString())"` line. */
function decodeNodeEval(command: string): string {
  const match = /Buffer\.from\('([^']+)','base64'\)/.exec(command);
  assert.ok(match, `expected a node -e eval line, got ${command}`);
  return Buffer.from(match[1]!, 'base64').toString('utf8');
}

/** The neutral events with a Cursor name, and Cursor's own spelling. */
const NEUTRAL_EVENTS: readonly (readonly [string, string])[] = [
  ['before-tool', 'preToolUse'],
  ['after-tool', 'postToolUse'],
  ['prompt-submit', 'beforeSubmitPrompt'],
  ['session-start', 'sessionStart'],
  ['stop', 'stop'],
  ['subagent-stop', 'subagentStop'],
];

/** The same events by their legacy Claude Code names, which the schema still accepts. */
const EVENT_ALIASES: readonly (readonly [string, string])[] = [
  ['PreToolUse', 'preToolUse'],
  ['PostToolUse', 'postToolUse'],
  ['UserPromptSubmit', 'beforeSubmitPrompt'],
  ['Stop', 'stop'],
  ['SubagentStop', 'subagentStop'],
  ['SessionStart', 'sessionStart'],
];

/** Every event a renderable hook can use. */
const RENDERABLE_EVENTS = [
  ...NEUTRAL_EVENTS.map(([event]) => event),
  ...EVENT_ALIASES.map(([event]) => event),
];

// ── events ────────────────────────────────────────────────────────────────────

describe('Cursor hook events', () => {
  for (const [label, events] of [
    ['neutral', NEUTRAL_EVENTS],
    ['legacy', EVENT_ALIASES],
  ] as const) {
    for (const [event, camel] of events) {
      it(`maps ${label} ${event} to ${camel}`, () => {
        const artifact = asArtifact(makeHook({ event, matcher: undefined }));
        assert.equal(eventName(onlyOp(artifact)), camel);
      });
    }
  }
});

// ── skipped hooks ─────────────────────────────────────────────────────────────

const SKIP_CASES: readonly { name: string; overrides: Record<string, unknown> }[] = [
  { name: 'the Notification event', overrides: { event: 'Notification', matcher: undefined } },
  { name: 'the notification event', overrides: { event: 'notification', matcher: undefined } },
  {
    name: 'the PermissionRequest event',
    overrides: { event: 'PermissionRequest', matcher: undefined },
  },
  { name: 'an undocumented event', overrides: { event: 'Bogus', matcher: undefined } },
  { name: 'SessionEnd', overrides: { event: 'SessionEnd', matcher: undefined } },
  { name: 'PreCompact', overrides: { event: 'PreCompact', matcher: undefined } },
  { name: 'SubagentStart', overrides: { event: 'SubagentStart', matcher: undefined } },
  { name: 'a matcher naming todo', overrides: { matcher: 'todo' } },
  { name: 'a matcher naming todo beside another tool', overrides: { matcher: 'edit|todo' } },
  {
    name: 'SessionStart with a matcher',
    overrides: { event: 'SessionStart', matcher: 'startup' },
  },
  {
    name: 'a command word containing a single quote',
    overrides: { command: './c.sh', args: ["it's"] },
  },
];

const RENDERABLE_OVERRIDES: readonly Record<string, unknown>[] = [
  ...NEUTRAL_EVENTS.map(([event]) => ({ event, matcher: undefined })),
  ...EVENT_ALIASES.map(([event]) => ({ event, matcher: undefined })),
  { event: 'before-tool', matcher: 'shell|edit' },
  { matcher: 'Bash' },
  { matcher: 'Edit|Write' },
  { matcher: 'Edit|Write|MultiEdit|NotebookEdit' },
  { matcher: 'Read|Grep' },
  { matcher: 'Bash|Edit' },
  { matcher: 'Task|WebFetch|WebSearch' },
  { matcher: 'shell|edit' },
  { matcher: undefined },
  { matcher: '*' },
  { command: './check.sh', args: ['--strict', 'a b'] },
  { command: './check.sh', args: undefined },
  { timeout: 30 },
];

describe('Cursor hook skip reasons', () => {
  for (const { name, overrides } of SKIP_CASES) {
    it(`gives a reason and throws it for ${name}`, () => {
      const artifact = asArtifact(makeHook(overrides));
      const reason = cursorHookSkipReason(artifact);
      assert.ok(reason !== undefined && reason.length > 0, 'a skip names its reason');
      assert.throws(
        () => buildCursorHookOps(artifact, 'project'),
        (err: Error) => err instanceof SigilError && err.message === reason,
      );
    });
  }

  it('names PowerShell when a command word contains a single quote', () => {
    const artifact = asArtifact(makeHook({ command: './c.sh', args: ["it's"] }));
    assert.match(cursorHookSkipReason(artifact) ?? '', /PowerShell/);
  });

  it('names the neutral tool Cursor has no hook name for', () => {
    const artifact = asArtifact(makeHook({ matcher: 'todo' }));
    assert.match(cursorHookSkipReason(artifact) ?? '', /'todo'/);
  });

  it('names the event Cursor has no hook event for', () => {
    const artifact = asArtifact(makeHook({ event: 'notification', matcher: undefined }));
    assert.match(cursorHookSkipReason(artifact) ?? '', /'notification'/);
  });

  it('does not refuse a script hook for a PowerShell quoting hazard', () => {
    const artifact = asArtifact(
      makeHook({ command: undefined, args: undefined, script: "const x = 'quoted';" }),
    );
    assert.equal(cursorHookSkipReason(artifact), undefined);
  });

  it('returns undefined for every renderable hook', () => {
    for (const overrides of RENDERABLE_OVERRIDES) {
      const artifact = asArtifact(makeHook(overrides));
      assert.equal(cursorHookSkipReason(artifact), undefined, JSON.stringify(overrides));
    }
  });
});

// ── selection ─────────────────────────────────────────────────────────────────

describe('Cursor hook selection', () => {
  const target = new CursorTarget();

  /** Resolves one hook selector the way `sigil add --target cursor` does. */
  const select = (artifact: FakeArtifact) =>
    resolveSelection({
      selectors: [`hook:${artifact.id}`],
      filters: {},
      catalog: makeCatalog(artifact),
      packs: [],
      supportedKinds: installableKinds(target),
      carriedKinds: carriedKinds(target),
      targetName: 'cursor',
      skipReason: a => target.configSkipReason?.(a),
    });

  it('skips a hook Cursor cannot render, with its reason and cause', () => {
    const artifact = makeHook({ event: 'Notification', matcher: undefined });
    const result = select(artifact);

    assert.deepEqual(result.ids, []);
    assert.equal(result.skipped.length, 1);
    const skipped = result.skipped[0]!;
    assert.equal(skipped.cause, 'unrenderable');
    assert.equal(skipped.reason, cursorHookSkipReason(asArtifact(artifact)));
  });

  it('selects a PreToolUse hook Cursor can render', () => {
    const artifact = makeHook({ event: 'PreToolUse', matcher: undefined });
    const result = select(artifact);

    assert.deepEqual(result.ids, ['shared/test-hook']);
    assert.deepEqual(result.skipped, []);
  });
});

// ── fragment shape ────────────────────────────────────────────────────────────

describe('Cursor hook fragment shape', () => {
  it('is version-first, with one preToolUse entry and the exact strategy', () => {
    const op = onlyOp(asArtifact(makeHook()));

    assert.equal(op.file, HOOK_FILE);
    assert.equal(op.root, 'project');
    assert.deepEqual(op.fragment, {
      version: 1,
      hooks: {
        preToolUse: [
          {
            type: 'command',
            command: nodeEvalCommandLine('node', ['-e', 'x']),
            matcher: EDIT_MATCHER,
          },
        ],
      },
    });
    assert.deepEqual(op.strategy, { version: 'file-marker', hooks: 'array-append' });
    assert.equal(Object.keys(op.fragment)[0], 'version', 'version comes first');
  });
});

// ── matchers ──────────────────────────────────────────────────────────────────

const MATCHER_CASES: readonly (readonly [string | undefined, string | undefined])[] = [
  ['Bash', 'Shell'],
  ['Edit|Write', EDIT_MATCHER],
  ['Edit|Write|MultiEdit|NotebookEdit', EDIT_MATCHER],
  ['Read|Grep', 'Read|Grep'],
  ['Glob|Read', 'Grep|Read'],
  ['Bash|Edit', `Shell|${EDIT_MATCHER}`],
  ['Task|WebFetch|WebSearch', 'Task|WebFetch|WebSearch'],
  ['shell|edit', `Shell|${EDIT_MATCHER}`],
  ['read|search', 'Read|Grep'],
  [undefined, undefined],
  ['*', undefined],
];

describe('Cursor hook matcher translation', () => {
  for (const event of ['before-tool', 'after-tool', 'PreToolUse', 'PostToolUse']) {
    for (const [matcher, expected] of MATCHER_CASES) {
      it(`${event} ${matcher ?? 'without a matcher'} renders ${expected ?? 'no matcher'}`, () => {
        const artifact = asArtifact(makeHook({ event, matcher }));
        const entry = hookEntry(onlyOp(artifact));
        if (expected === undefined) assert.ok(!('matcher' in entry), 'no matcher key');
        else assert.equal(entry.matcher, expected);
      });
    }
  }
});

// ── command line ──────────────────────────────────────────────────────────────

const SCRIPT = 'process.exitCode = 0;';

describe('Cursor hook command line', () => {
  for (const event of RENDERABLE_EVENTS) {
    it(`renders node -e for ${event} as the script, with no wrapper`, () => {
      const artifact = asArtifact(makeHook({ event, matcher: undefined, args: ['-e', SCRIPT] }));
      const entry = hookEntry(onlyOp(artifact));
      assert.equal(decodeNodeEval(entry.command as string), SCRIPT);
    });
  }

  it('joins command and args into one POSIX line', () => {
    const artifact = asArtifact(makeHook({ command: './check.sh', args: ['--strict', 'a b'] }));
    assert.equal(hookEntry(onlyOp(artifact)).command, `./check.sh --strict 'a b'`);
  });

  it('keeps a command with no args as written', () => {
    const artifact = asArtifact(makeHook({ command: './check.sh', args: undefined }));
    assert.equal(hookEntry(onlyOp(artifact)).command, './check.sh');
  });
});

// ── The neutral hook contract ──────────────────────────────────────────────────

/** A fixture script hook: deny any call that names a `.env` file. */
const DENY_ENV_SCRIPT = [
  "const hit = input && input.files.find(file => file.split('/').pop().startsWith('.env'));",
  'if (hit) {',
  "  process.stderr.write('sigil-test: blocked ' + hit + '\\n');",
  '  process.exitCode = 2;',
  '}',
].join('\n');

/** A neutral script hook with Cursor's `edit` matcher. */
const scriptHook = (overrides: Record<string, unknown> = {}) =>
  asArtifact(
    makeHook({
      event: 'before-tool',
      matcher: 'edit',
      command: undefined,
      args: undefined,
      script: DENY_ENV_SCRIPT,
      ...overrides,
    }),
  );

/** Runs a hook command string through `sh -c`, with the test's own node first on PATH. */
function runCommandLine(
  commandLine: string,
  stdin: string,
): { status: number | null; stderr: string } {
  const nodeDir = path.dirname(process.execPath);
  const env = { ...process.env, PATH: `${nodeDir}${path.delimiter}${process.env.PATH ?? ''}` };
  const r = spawnSync('sh', ['-c', commandLine], { input: stdin, encoding: 'utf8', env });
  return { status: r.status, stderr: r.stderr };
}

describe('Cursor hook contract', () => {
  it('should render a neutral script hook as one node -e command line', () => {
    const op = onlyOp(scriptHook({ matcher: 'shell|edit' }));
    assert.equal(eventName(op), 'preToolUse');
    const entry = hookEntry(op);
    assert.equal(entry.matcher, 'Shell|Write|Delete');

    const source = decodeNodeEval(entry.command as string);
    assert.match(source, /normalizeHookInput/);
    assert.match(source, /"before-tool"/);
    assert.ok(!('args' in entry), 'Cursor has no args field');
  });

  it('should run a rendered command through sh -c and deny an A4 .env write with exit 2', () => {
    const entry = hookEntry(onlyOp(scriptHook()));
    const payload = JSON.stringify({
      hook_event_name: 'preToolUse',
      tool_name: 'Write',
      tool_input: { file_path: '/repo/.env' },
    });
    const blocked = runCommandLine(entry.command as string, payload);
    assert.equal(blocked.status, 2, blocked.stderr);
    assert.match(blocked.stderr, /sigil-test: blocked/);

    const allowed = runCommandLine(
      entry.command as string,
      JSON.stringify({
        hook_event_name: 'preToolUse',
        tool_name: 'Write',
        tool_input: { file_path: '/repo/notes.txt' },
      }),
    );
    assert.equal(allowed.status, 0, allowed.stderr);
  });

  it('should keep a legacy command hook’s event and matcher', () => {
    const artifact = asArtifact(
      makeHook({ event: 'PreToolUse', matcher: 'Edit|Write', command: 'node', args: ['-e', 'x'] }),
    );
    const op = onlyOp(artifact);
    assert.equal(eventName(op), 'preToolUse');
    assert.equal(hookEntry(op).matcher, EDIT_MATCHER);
    assert.equal(
      hookEntry(op).command,
      nodeEvalCommandLine('node', ['-e', 'x']),
      'a command hook keeps its own command line',
    );
  });

  it('should render a non-tool event with the schema default matcher', () => {
    const artifact = asArtifact(makeHook({ event: 'session-start', matcher: '*', command: 'x' }));
    assert.equal(new CursorTarget().configSkipReason?.(artifact), undefined);
    assert.equal(eventName(onlyOp(artifact)), 'sessionStart');
  });
});

// ── timeout ───────────────────────────────────────────────────────────────────

describe('Cursor hook timeout', () => {
  it('carries timeout when the hook sets one', () => {
    const entry = hookEntry(onlyOp(asArtifact(makeHook({ timeout: 30 }))));
    assert.equal(entry.timeout, 30);
  });

  it('omits timeout when the hook sets none', () => {
    const entry = hookEntry(onlyOp(asArtifact(makeHook())));
    assert.ok(!('timeout' in entry), 'no timeout key');
  });
});

// ── destinations ──────────────────────────────────────────────────────────────

describe('Cursor hook destinations', () => {
  it('project scope writes .cursor/hooks.json at the project root', () => {
    const op = onlyOp(asArtifact(makeHook()), 'project');
    assert.equal(op.file, HOOK_FILE);
    assert.equal(op.root, 'project');
  });

  it('user scope writes .cursor/hooks.json under home', () => {
    const op = onlyOp(asArtifact(makeHook()), 'user');
    assert.equal(op.file, HOOK_FILE);
    assert.equal(op.root, 'home');
  });

  it('refuses local scope, naming project and user', () => {
    assert.throws(
      () => buildCursorHookOps(asArtifact(makeHook()), 'local'),
      (err: Error) => {
        assert.ok(err instanceof SigilError);
        assert.match(err.message, /project/);
        assert.match(err.message, /user/);
        return true;
      },
    );
  });
});

// ── target scaffoldConfig ─────────────────────────────────────────────────────

describe('Cursor hook target scaffoldConfig', () => {
  const target: Target = new CursorTarget();

  it('sends an mcp artifact to .cursor/mcp.json, not the hook file', async () => {
    const ops = await scaffold(target, 'shared/test-mcp', makeCatalog(makeMcp()), 'project');
    assert.equal(ops[0]!.file, '.cursor/mcp.json');
  });

  it('uses defaultScope user when no scope option is given', async () => {
    const ops = await scaffoldAtDefault(
      target,
      'shared/test-hook',
      makeCatalog(makeHook({ defaultScope: 'user' })),
    );
    assert.equal(ops[0]!.root, 'home');
  });

  it('defaults to project when neither a scope option nor defaultScope is given', async () => {
    const ops = await scaffoldAtDefault(target, 'shared/test-hook', makeCatalog(makeHook()));
    assert.equal(ops[0]!.root, 'project');
  });

  it('offers project then user, with the hooks section', () => {
    const scopes = target.configScopes!(['hook'], PROJECT_DIR);
    assert.equal(scopes.length, 2);
    assert.equal(scopes[0]!.value, 'project');
    assert.equal(scopes[1]!.value, 'user');

    const project = scopes[0]!.destinations[0]!;
    const user = scopes[1]!.destinations[0]!;
    assert.equal(project.fullPath, path.join(PROJECT_DIR, '.cursor', 'hooks.json'));
    assert.equal(user.fullPath, path.join(os.homedir(), '.cursor', 'hooks.json'));
    assert.equal(project.section, 'hooks');
    assert.equal(user.section, 'hooks');
  });
});

// ── the real catalog ──────────────────────────────────────────────────────────

describe('Cursor hook real catalog', () => {
  it('protect-config maps edit to the edit matcher and composes its script', async () => {
    const catalog = await loadResolvedCatalog();
    const artifact = catalog.byId.get('shared/protect-config')!;
    assert.equal(cursorHookSkipReason(artifact), undefined);

    const entry = hookEntry(onlyOp(artifact));
    assert.equal(entry.matcher, EDIT_MATCHER);
    const composed = decodeNodeEval(entry.command as string);
    assert.match(composed, /normalizeHookInput/);
    assert.ok(
      composed.includes(artifact.frontmatter.script as string),
      'the composed node -e source embeds the hook script',
    );
  });

  it('reviewer-bash-guard maps shell to Shell and composes its script', async () => {
    const catalog = await loadResolvedCatalog();
    const artifact = catalog.byId.get('shared/reviewer-bash-guard')!;
    assert.equal(cursorHookSkipReason(artifact), undefined);

    const entry = hookEntry(onlyOp(artifact));
    assert.equal(entry.matcher, 'Shell');
    const composed = decodeNodeEval(entry.command as string);
    assert.match(composed, /normalizeHookInput/);
    assert.ok(
      composed.includes(artifact.frontmatter.script as string),
      'the composed node -e source embeds the hook script',
    );
  });
});

// ── A4's payload through the rendered protect-config hook ─────────────────────

describe('Cursor hook protect-config with A4 payload', () => {
  it(
    'blocks a call naming .env and allows one naming notes.txt',
    { skip: process.platform === 'win32' },
    async () => {
      const catalog = await loadResolvedCatalog();
      const entry = hookEntry(onlyOp(catalog.byId.get('shared/protect-config')!));

      withTempDir(dir => {
        const scriptPath = path.join(dir, 'hook.sh');
        fs.writeFileSync(scriptPath, `${entry.command as string}\n`);

        const run = (filePath: string) => {
          const payload = JSON.stringify({
            tool_name: 'Write',
            tool_input: { file_path: filePath },
            hook_event_name: 'preToolUse',
          });
          const nodeDir = path.dirname(process.execPath);
          const env = {
            ...process.env,
            PATH: `${nodeDir}${path.delimiter}${process.env.PATH ?? ''}`,
          };
          return spawnSync('sh', [scriptPath], { input: payload, encoding: 'utf8', env });
        };

        const blocked = run(path.join(dir, '.env'));
        assert.equal(blocked.status, 2, blocked.stderr ?? '');
        assert.match(blocked.stderr, /blocked write to protected file/);

        const allowed = run(path.join(dir, 'notes.txt'));
        assert.equal(allowed.status, 0, allowed.stderr ?? '');
        assert.equal(allowed.stdout, '');
      });
    },
  );
});

// ── end to end through the built CLI ──────────────────────────────────────────

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const HOME_VAR = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';
const PROTECT_CONFIG = 'shared/protect-config';
const E2E_BASH_GUARD = 'shared/e2e-bash-guard';

/**
 * The Bash-matcher hook case 2 installs. `shared/reviewer-bash-guard` is `platforms: [claude]`, so
 * it cannot be added for Cursor: this fixture copies protect-config's frontmatter shape instead.
 */
const E2E_HOOK_SOURCE = `---
id: shared/e2e-bash-guard
kind: hook
title: "E2E Bash Guard"
description: >-
  A test fixture hook with a Bash matcher, so a Cursor install can carry a Shell entry.
event: PreToolUse
matcher: Bash
command: node
args:
  - "-e"
  - |-
    process.exitCode = 0;
tags: [test, fixture]
---

A fixture hook for the Cursor hook end-to-end tests.
`;

/** A project dir and a home dir, both empty. */
function makeDirs(work: string): { project: string; home: string } {
  const project = path.join(work, 'project');
  const home = path.join(work, 'home');
  fs.mkdirSync(project);
  fs.mkdirSync(home);
  return { project, home };
}

/** The bundled catalog, copied, plus the Bash-matcher fixture hook case 2 installs. */
function copyCatalog(work: string): string {
  const catalogDir = path.join(work, 'catalog');
  fs.cpSync(CATALOG_DIR, catalogDir, { recursive: true });
  fs.writeFileSync(
    path.join(catalogDir, 'shared', 'hooks', 'e2e-bash-guard.hook.md'),
    E2E_HOOK_SOURCE,
  );
  return catalogDir;
}

/** Runs the built CLI in `cwd` with HOME pointed at `home`, and asserts it exited 0. */
function sigil(cwd: string, home: string, ...args: string[]): void {
  const done = spawnSync(process.execPath, [CLI, ...args, '--project-dir', cwd], {
    cwd,
    encoding: 'utf8',
    input: '',
    windowsHide: true,
    env: { ...process.env, [HOME_VAR]: home },
  });
  assert.equal(done.status, 0, `${done.stdout ?? ''}${done.stderr ?? ''}`);
}

const addHook = (
  project: string,
  home: string,
  catalogDir: string,
  id: string,
  scope = 'project',
): void =>
  sigil(
    project,
    home,
    'add',
    id,
    '--target',
    'cursor',
    '--scope',
    scope,
    '--yes',
    '--catalog-dir',
    catalogDir,
  );

const uninstallHook = (project: string, home: string, id: string): void =>
  sigil(project, home, 'uninstall', id, '--target', 'cursor', '--yes');

const readJsonFile = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** The top-level Cursor shape, plus the one `preToolUse` array it holds. */
function preToolUseEntries(file: string): Record<string, unknown>[] {
  const json = readJsonFile(file);
  assert.deepEqual(Object.keys(json).sort(), ['hooks', 'version']);
  assert.equal(json.version, 1);
  assert.deepEqual(Object.keys(json.hooks), ['preToolUse']);
  const entries = json.hooks.preToolUse as Record<string, unknown>[];
  assert.ok(Array.isArray(entries), 'preToolUse holds an array');
  return entries;
}

describe('Cursor hook e2e', () => {
  it('case 1: add writes version 1 and one edit preToolUse entry', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, '.cursor', 'hooks.json');

      addHook(project, home, catalogDir, PROTECT_CONFIG);

      const entries = preToolUseEntries(file);
      assert.equal(entries.length, 1);
      assert.deepEqual(Object.keys(entries[0]!), ['type', 'command', 'matcher']);
      assert.equal(entries[0]!.type, 'command');
      assert.equal(typeof entries[0]!.command, 'string');
      assert.equal(entries[0]!.matcher, EDIT_MATCHER);
    });
  });

  it('case 2: the Bash hook adds a Shell entry and the file keeps one version key', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, '.cursor', 'hooks.json');

      addHook(project, home, catalogDir, PROTECT_CONFIG);
      addHook(project, home, catalogDir, E2E_BASH_GUARD);

      const entries = preToolUseEntries(file);
      assert.deepEqual(
        entries.map(entry => entry.matcher),
        [EDIT_MATCHER, 'Shell'],
      );
      const raw = fs.readFileSync(file, 'utf8');
      assert.equal(raw.split('"version"').length - 1, 1, 'version appears once');
    });
  });

  it('case 3: re-adding protect-config replaces its entry instead of stacking one', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, '.cursor', 'hooks.json');

      addHook(project, home, catalogDir, PROTECT_CONFIG);
      addHook(project, home, catalogDir, E2E_BASH_GUARD);
      addHook(project, home, catalogDir, PROTECT_CONFIG);

      const entries = preToolUseEntries(file);
      assert.equal(entries.filter(entry => entry.matcher === EDIT_MATCHER).length, 1);
      assert.equal(entries.length, 2);
    });
  });

  it('case 4: uninstalling protect-config leaves the Shell entry and version 1', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, '.cursor', 'hooks.json');

      addHook(project, home, catalogDir, PROTECT_CONFIG);
      addHook(project, home, catalogDir, E2E_BASH_GUARD);
      uninstallHook(project, home, PROTECT_CONFIG);

      const entries = preToolUseEntries(file);
      assert.equal(entries.length, 1);
      assert.equal(entries[0]!.matcher, 'Shell');
    });
  });

  it('case 5: uninstalling the last hook removes .cursor/hooks.json', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, '.cursor', 'hooks.json');

      addHook(project, home, catalogDir, PROTECT_CONFIG);
      addHook(project, home, catalogDir, E2E_BASH_GUARD);
      uninstallHook(project, home, PROTECT_CONFIG);
      uninstallHook(project, home, E2E_BASH_GUARD);

      assert.equal(fs.existsSync(file), false, 'the hook file is gone');
    });
  });

  it('case 6: user scope keeps a user hook and writes the backup once', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const userFile = path.join(home, '.cursor', 'hooks.json');
      const backup = `${userFile}.sigil.bak`;
      const userHook = { type: 'command', command: 'echo user-hook' };
      fs.mkdirSync(path.dirname(userFile), { recursive: true });
      fs.writeFileSync(userFile, JSON.stringify({ version: 1, hooks: { preToolUse: [userHook] } }));
      const originalBytes = fs.readFileSync(userFile);

      addHook(project, home, catalogDir, PROTECT_CONFIG, 'user');

      const afterFirst = preToolUseEntries(userFile);
      assert.equal(afterFirst.length, 2);
      assert.deepEqual(afterFirst[0], userHook, 'the user hook is kept');
      assert.equal(afterFirst[1]!.matcher, EDIT_MATCHER);
      assert.ok(fs.existsSync(backup), 'the backup exists');
      assert.ok(fs.readFileSync(backup).equals(originalBytes), 'the backup is the original bytes');

      addHook(project, home, catalogDir, E2E_BASH_GUARD, 'user');

      assert.ok(
        fs.readFileSync(backup).equals(originalBytes),
        'a second add leaves the backup unchanged',
      );
      assert.deepEqual(
        fs.readdirSync(path.dirname(userFile)).filter(name => name.endsWith('.sigil.bak')),
        ['hooks.json.sigil.bak'],
        'no second backup file',
      );
      assert.equal(preToolUseEntries(userFile).length, 3);
    });
  });

  it('case 7: add then uninstall restores a user-written project file exactly', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, '.cursor', 'hooks.json');
      const original = {
        version: 1,
        hooks: { preToolUse: [{ type: 'command', command: 'echo user-hook' }] },
      };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(original));

      addHook(project, home, catalogDir, PROTECT_CONFIG);
      uninstallHook(project, home, PROTECT_CONFIG);

      assert.deepEqual(readJsonFile(file), original);
    });
  });
});
