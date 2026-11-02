/**
 * The neutral hook input contract (src/targets/hook-input.ts): `normalizeHookInput` turns a
 * provider's stdin JSON into the neutral `HookInput`, and `composeHookScript` embeds that same
 * normalizer into the installed `node -e` source. The composed-script cases spawn a real Node
 * process, so the guard is the shipped function and not just an imported copy. The contract is
 * docs/decisions/neutral-hook-contract-2026-11.md, decisions 3-5.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { composeHookScript, normalizeHookInput } from '../../dist-cli/targets/hook-input';
import type { HookInputDialect } from '../../dist-cli/targets/hook-input';
import { getAllTargets } from '../../dist-cli/targets/index';
import { supportsKind } from '../../dist-cli/targets/capabilities';

/** A dialect shaped like Claude's, plus the raw-`apply_patch` patch tools. */
const CLAUDE_LIKE: HookInputDialect = {
  toolField: 'tool_name',
  inputField: 'tool_input',
  pathFields: ['file_path', 'path', 'notebook_path'],
  commandField: 'command',
  patch: { tools: ['apply_patch'], field: 'command' },
  agentField: 'agent_type',
  cwdField: 'cwd',
  toolNames: {
    Read: 'read',
    Edit: 'edit',
    Write: 'edit',
    NotebookEdit: 'edit',
    Bash: 'shell',
    apply_patch: 'edit',
  },
};

/** A dialect shaped like Antigravity's (`toolCall.name` / `toolCall.args`). */
const ANTIGRAVITY_LIKE: HookInputDialect = {
  toolField: 'toolCall.name',
  inputField: 'toolCall.args',
  pathFields: ['Path', 'TargetFile'],
  commandField: 'CommandLine',
  toolNames: {
    write_file: 'edit',
    run_command: 'shell',
  },
};

/** Runs one composed script with `stdin` through `node -e`, with no shell in between. */
function runComposed(composed: string, stdin: string): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ['-e', composed], { input: stdin, encoding: 'utf8' });
}

describe('normalizeHookInput', () => {
  it('should map a provider tool and its path field to the neutral shape', () => {
    assert.deepEqual(
      normalizeHookInput(
        JSON.stringify({ tool_name: 'Write', tool_input: { file_path: '/r/.env' } }),
        CLAUDE_LIKE,
        'before-tool',
      ),
      { event: 'before-tool', tool: 'edit', files: ['/r/.env'] },
    );
  });

  it('should read the shell command and the subagent type', () => {
    assert.deepEqual(
      normalizeHookInput(
        JSON.stringify({
          tool_name: 'Bash',
          tool_input: { command: 'ls' },
          agent_type: 'x:code-reviewer',
        }),
        CLAUDE_LIKE,
        'before-tool',
      ),
      {
        event: 'before-tool',
        tool: 'shell',
        files: [],
        command: 'ls',
        agent: 'x:code-reviewer',
      },
    );
  });

  it('should read every path field and no command for an edit tool', () => {
    const input = normalizeHookInput(
      JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: '/r/a.md', path: '/r/b.md', notebook_path: '/r/c.ipynb' },
        cwd: '/r',
      }),
      CLAUDE_LIKE,
      'before-tool',
    );
    assert.deepEqual(input, {
      event: 'before-tool',
      tool: 'edit',
      files: ['/r/a.md', '/r/b.md', '/r/c.ipynb'],
      cwd: '/r',
    });
  });

  it('should collect every patch header from a named patch field', () => {
    const patch = [
      '*** Begin Patch',
      '*** Update File: /r/.env',
      '@@',
      '*** Update File: /r/config.json',
      '*** End Patch',
    ].join('\n');
    assert.deepEqual(
      normalizeHookInput(
        JSON.stringify({ tool_name: 'apply_patch', tool_input: { command: patch } }),
        CLAUDE_LIKE,
        'before-tool',
      ),
      { event: 'before-tool', tool: 'edit', files: ['/r/.env', '/r/config.json'] },
    );
  });

  it('should read a raw patch string as the arguments themselves', () => {
    assert.deepEqual(
      normalizeHookInput(
        JSON.stringify({
          tool_name: 'apply_patch',
          tool_input: '*** Add File: /r/.env\n+SECRET=1\n',
        }),
        CLAUDE_LIKE,
        'before-tool',
      ),
      { event: 'before-tool', tool: 'edit', files: ['/r/.env'] },
    );
  });

  it('should leave the tool undefined for an unknown name but still read the files', () => {
    assert.deepEqual(
      normalizeHookInput(
        JSON.stringify({ tool_name: 'Mystery', tool_input: { file_path: '/r/.env' } }),
        CLAUDE_LIKE,
        'before-tool',
      ),
      { event: 'before-tool', files: ['/r/.env'] },
    );
  });

  it('should dedupe files in first-seen order', () => {
    assert.deepEqual(
      normalizeHookInput(
        JSON.stringify({
          tool_name: 'Write',
          tool_input: {
            file_path: '/r/.env',
            path: '/r/.env',
            notebook_path: '',
          },
        }),
        CLAUDE_LIKE,
        'before-tool',
      ),
      { event: 'before-tool', tool: 'edit', files: ['/r/.env'] },
    );
  });

  it('should return undefined for stdin that is not a JSON object', () => {
    for (const raw of ['not json', '42', 'null', '["a"]']) {
      assert.equal(normalizeHookInput(raw, CLAUDE_LIKE, 'before-tool'), undefined, raw);
    }
  });

  it('should read an Antigravity-shaped payload through dotted paths', () => {
    assert.deepEqual(
      normalizeHookInput(
        JSON.stringify({ toolCall: { name: 'write_file', args: { Path: '/r/.env' } } }),
        ANTIGRAVITY_LIKE,
        'before-tool',
      ),
      { event: 'before-tool', tool: 'edit', files: ['/r/.env'] },
    );
  });

  it('should read Antigravity’s TargetFile and CommandLine', () => {
    assert.deepEqual(
      normalizeHookInput(
        JSON.stringify({
          toolCall: {
            name: 'run_command',
            args: { TargetFile: '/r/a.sh', CommandLine: 'rm /r/a.sh' },
          },
        }),
        ANTIGRAVITY_LIKE,
        'before-tool',
      ),
      {
        event: 'before-tool',
        tool: 'shell',
        files: ['/r/a.sh'],
        command: 'rm /r/a.sh',
      },
    );
  });

  it('should be the function its own source produces', () => {
    const standalone = new Function(
      'return (' + normalizeHookInput.toString() + ')',
    )() as unknown as typeof normalizeHookInput;
    const raw = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      agent_type: 'x:code-reviewer',
      cwd: '/r',
    });
    assert.deepEqual(
      standalone(raw, CLAUDE_LIKE, 'before-tool'),
      normalizeHookInput(raw, CLAUDE_LIKE, 'before-tool'),
    );
  });
});

describe('composeHookScript', () => {
  it('should deny a protected file and allow anything else', () => {
    const body =
      "if (input.files.includes('/r/.env')) { process.stderr.write('no'); process.exitCode = 2; }";
    const composed = composeHookScript(body, CLAUDE_LIKE, 'before-tool');
    const denied = runComposed(
      composed,
      JSON.stringify({ tool_name: 'Write', tool_input: { file_path: '/r/.env' } }),
    );
    assert.equal(denied.status, 2);
    assert.equal(denied.stderr, 'no');
    const allowed = runComposed(
      composed,
      JSON.stringify({ tool_name: 'Write', tool_input: { file_path: '/r/src.ts' } }),
    );
    assert.equal(allowed.status, 0);
  });

  it('should hand undefined to the script when stdin is not JSON', () => {
    const composed = composeHookScript(
      'if (input === undefined) process.exitCode = 3',
      CLAUDE_LIKE,
      'before-tool',
    );
    assert.equal(runComposed(composed, 'not json').status, 3);
  });

  const GUARD =
    "if (input && input.files.includes('/r/.env')) { process.stderr.write('no'); process.exitCode = 2; }";

  it('should skip the script for a named tool outside the matcher', () => {
    const composed = composeHookScript(GUARD, CLAUDE_LIKE, 'before-tool', ['edit']);
    const result = runComposed(
      composed,
      JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/r/.env' } }),
    );
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
  });

  it('should run the script for a named tool inside the matcher', () => {
    const composed = composeHookScript(GUARD, CLAUDE_LIKE, 'before-tool', ['edit']);
    const result = runComposed(
      composed,
      JSON.stringify({ tool_name: 'Write', tool_input: { file_path: '/r/.env' } }),
    );
    assert.equal(result.status, 2);
    assert.equal(result.stderr, 'no');
  });

  it('should run the script for a tool sigil cannot name', () => {
    const composed = composeHookScript(GUARD, CLAUDE_LIKE, 'before-tool', ['edit']);
    const result = runComposed(
      composed,
      JSON.stringify({ tool_name: 'Mystery', tool_input: { file_path: '/r/.env' } }),
    );
    assert.equal(result.status, 2);
  });

  it('should run the script when stdin is not JSON and the matcher is set', () => {
    const composed = composeHookScript(
      'if (!input) process.exitCode = 3',
      CLAUDE_LIKE,
      'before-tool',
      ['edit'],
    );
    assert.equal(runComposed(composed, 'not json').status, 3);
  });

  it('should run the script on every tool when the matcher is all', () => {
    const composed = composeHookScript(GUARD, CLAUDE_LIKE, 'before-tool');
    const result = runComposed(
      composed,
      JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/r/.env' } }),
    );
    assert.equal(result.status, 2);
  });

  it('should not filter an event outside the tool events', () => {
    const composed = composeHookScript(GUARD, CLAUDE_LIKE, 'session-start', ['edit']);
    const result = runComposed(
      composed,
      JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/r/.env' } }),
    );
    assert.equal(result.status, 2);
  });
});

describe('Target.hookInput', () => {
  it('should be set on every target with a native hook kind', () => {
    for (const target of getAllTargets()) {
      if (!supportsKind(target, 'hook', 'scaffold')) continue;
      assert.notEqual(target.hookInput, undefined, `${target.name} has no hookInput`);
    }
  });
});
