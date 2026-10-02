/**
 * Commands printed for the user to repeat are pasted into a terminal. They are one unbroken line with
 * no gutter and no shell-specific continuation, so a copy holds the command and nothing else and it
 * means the same in PowerShell, Git Bash/bash and cmd. A wrapped multi-line command would not: each
 * shell continues a line differently (backslash, backtick, caret) and the shell cannot be detected.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEquivalentCommand,
  printEquivalentCommand,
} from '../../dist-cli/wizard/command-strings';
import { copyableLine } from '../../dist-cli/wizard/frame';
import { launcherPrefix, withLauncher } from '../../dist-cli/invocation';
import { createRecorder, mockClack } from '../helpers/clack-mock';
import type { Recorder } from '../helpers/clack-mock';
import { loadResolvedCatalog } from '../helpers/catalog';
import { stripAnsi } from '../helpers/ansi';
import { withWindow } from '../helpers/window';

/** Characters every one of PowerShell, bash and cmd passes through an argument unchanged. */
const INERT = /^[A-Za-z0-9:/_.,@= -]+$/;
const LONG = buildEquivalentCommand({
  selectors: Array.from({ length: 14 }, (_, i) => `rule:typescript/ts-rule-number-${i}`),
  target: 'claude',
  includeDeps: true,
  overwrite: true,
});

/** What `printEquivalentCommand` showed in a terminal: the lines it copied, and what it logged. */
async function printed(cmd: string, columns?: number): Promise<Recorder> {
  const rec = createRecorder();
  const restore = mockClack([], rec);
  try {
    const run = (): void => printEquivalentCommand(cmd, true);
    if (columns === undefined) run();
    else await withWindow({ columns }, run);
  } finally {
    restore();
  }
  return rec;
}

describe('printEquivalentCommand in a terminal', () => {
  for (const columns of [30, 60, 120, undefined]) {
    it(`should print the command as one flush-left line (${columns ?? 'no'} columns)`, async () => {
      const rec = await printed(LONG, columns);
      assert.deepEqual(rec.copied, [LONG]);
      assert.doesNotMatch(rec.copied[0] ?? '', /[│\n]/);
    });
  }

  it('should label the line, and say to copy all of it only when it is wider than the window', async () => {
    const narrow = stripAnsi((await printed(LONG, 60)).logs.join('\n'));
    const wide = stripAnsi((await printed(LONG, 2000)).logs.join('\n'));
    assert.match(narrow, /Repeat non-interactively \(one line, copy all of it\):/);
    assert.match(wide, /Repeat non-interactively:/);
    assert.doesNotMatch(wide, /copy all/);
  });

  it('should keep the plain text form unchanged outside a terminal', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (text: unknown) => void lines.push(String(text));
    try {
      printEquivalentCommand(LONG, false);
    } finally {
      console.log = original;
    }
    assert.deepEqual(lines, [`\nRepeat non-interactively:\n  ${LONG}`]);
  });
});

describe('copyableLine', () => {
  it('should write the text and a newline to stdout and nothing else', () => {
    const chunks: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) =>
      void chunks.push(String(chunk))) as never;
    try {
      copyableLine('sigil add x --yes');
    } finally {
      process.stdout.write = write;
    }
    assert.deepEqual(chunks, ['sigil add x --yes\n']);
  });
});

describe('the equivalent command is safe to paste in any shell', () => {
  it('should hold only characters that PowerShell, bash and cmd all pass through unchanged', async () => {
    const catalog = await loadResolvedCatalog();
    const selectors = catalog.artifacts.map(a => `${a.kind}:${a.id}`);
    assert.ok(selectors.length > 50);
    const extras = [
      {},
      { language: 'typescript', kinds: ['skill', 'rule'], exclude: ['hook'] },
      { includeDeps: false, overwrite: true, configScope: 'user', hasConfigKinds: true },
    ];
    for (const extra of extras) {
      const command = buildEquivalentCommand({
        selectors,
        target: 'claude',
        includeDeps: true,
        overwrite: false,
        ...extra,
      });
      assert.match(command, INERT, `unsafe character in: ${command.replace(INERT, '')}`);
    }
  });

  it('should hold no line continuation, quote or newline', () => {
    assert.doesNotMatch(LONG, /[\\`^"'\n]/);
  });
});

describe('launcherPrefix', () => {
  const viaScript = {
    npm_command: 'run-script',
    npm_lifecycle_event: 'sigil',
    npm_lifecycle_script: 'node dist-cli/cli.js',
  };
  const npmTest = {
    ...viaScript,
    npm_lifecycle_event: 'test',
    npm_lifecycle_script: 'node scripts/run-tests.cjs',
  };
  const cases: Array<[string, NodeJS.ProcessEnv, string]> = [
    ['npm run sigil', viaScript, 'npm run sigil --'],
    ['a differently named script', { ...viaScript, npm_lifecycle_event: 'cli' }, 'npm run cli --'],
    ['npm test', npmTest, 'sigil'],
    ['npx', { npm_command: 'exec', npm_lifecycle_event: 'npx' }, 'sigil'],
    ['an install on PATH', {}, 'sigil'],
    ['a script with no name', { ...viaScript, npm_lifecycle_event: '' }, 'sigil'],
  ];

  for (const [name, env, expected] of cases) {
    it(`should give "${expected}" for ${name}`, () => {
      assert.equal(launcherPrefix(env), expected);
    });
  }

  it('should replace only the leading sigil of a command', () => {
    assert.equal(
      withLauncher('sigil add rule:sigil/x --yes', viaScript),
      'npm run sigil -- add rule:sigil/x --yes',
    );
    assert.equal(withLauncher('sigilx add', viaScript), 'sigilx add');
    assert.equal(withLauncher('sigil add x', {}), 'sigil add x');
  });
});
