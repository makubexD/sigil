/**
 * Commands printed for the user to repeat are pasted into a terminal. They are flush-left with no
 * gutter, one line when they fit; a long one is wrapped between words, every line but the last ending
 * in the continuation of the shell the user is in, so a copy runs as the one command.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildEquivalentCommand,
  printEquivalentCommand,
  printSkippedAdvice,
  wrapCommand,
} from '../../dist-cli/wizard/command-strings';
import { copyableLine } from '../../dist-cli/wizard/frame';
import { SHELLS, detectShell, launcherPrefix, withLauncher } from '../../dist-cli/invocation';
import type { Shell } from '../../dist-cli/invocation';
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

const ALL_SHELLS: Shell[] = ['powershell', 'cmd', 'posix'];
const COMMANDS = [
  LONG,
  'sigil uninstall a/one b/two --target claude --force --yes',
  'sigil init --target claude',
];

/** The command a wrapped block holds, its continuations and indents removed. */
function unwrap(lines: string[], shell: Shell): string {
  const tail = ' ' + SHELLS[shell].continuation;
  return lines.map(l => (l.endsWith(tail) ? l.slice(0, -tail.length) : l).trim()).join(' ');
}

describe('wrapCommand', () => {
  for (const shell of ALL_SHELLS) {
    for (const width of [30, 40, 60, 100, 230]) {
      it(`should wrap between words only and lose nothing (${shell}, ${width} columns)`, () => {
        for (const cmd of COMMANDS) {
          const lines = wrapCommand(cmd, width, shell);
          const tail = ' ' + SHELLS[shell].continuation;
          assert.equal(unwrap(lines, shell), cmd);
          lines.forEach((line, i) => {
            const last = i === lines.length - 1;
            assert.equal(line.endsWith(tail), !last, JSON.stringify(line));
            assert.match(line, /^\S/);
            const body = last ? line : line.slice(0, -tail.length);
            // A single word longer than the window cannot be cut, so it may stand alone and overflow.
            if (body.trim().includes(' '))
              assert.ok(line.length <= width - 1, `${width}: ${JSON.stringify(line)}`);
            assert.doesNotMatch(line, /[│\t]/);
          });
        }
      });
    }
  }

  it('should keep a command that fits as one line with no continuation', () => {
    assert.deepEqual(wrapCommand('sigil init --target claude', 100, 'powershell'), [
      'sigil init --target claude',
    ]);
    assert.deepEqual(wrapCommand(LONG, undefined, 'cmd'), [LONG]);
  });
});

describe('detectShell', () => {
  const user =
    'C:\\Users\\a\\Documents\\PowerShell\\Modules;C:\\Program Files\\PowerShell\\Modules';
  const machine =
    'C:\\Program Files\\WindowsPowerShell\\Modules;C:\\WINDOWS\\system32\\WindowsPowerShell\\v1.0\\Modules';
  const cases: Array<[string, NodeJS.ProcessEnv, NodeJS.Platform, Shell]> = [
    ['PowerShell on Windows', { PSModulePath: user }, 'win32', 'powershell'],
    [
      'Windows PowerShell 5',
      { PSModulePath: 'C:\\Users\\a\\Documents\\WindowsPowerShell\\Modules' },
      'win32',
      'powershell',
    ],
    ['a fresh cmd', { PSModulePath: machine }, 'win32', 'cmd'],
    ['an empty environment on Windows', {}, 'win32', 'cmd'],
    ['Git Bash (MSYSTEM)', { MSYSTEM: 'MINGW64', PSModulePath: user }, 'win32', 'posix'],
    ['Git Bash (SHELL)', { SHELL: '/usr/bin/bash', PSModulePath: user }, 'win32', 'posix'],
    ['Linux', { PSModulePath: user }, 'linux', 'posix'],
    ['macOS', {}, 'darwin', 'posix'],
    ['an override to cmd', { SIGIL_SHELL: 'cmd', PSModulePath: user }, 'win32', 'cmd'],
    ['an override to pwsh', { SIGIL_SHELL: 'PWSH', MSYSTEM: 'MINGW64' }, 'win32', 'powershell'],
    ['an override to bash on Windows', { SIGIL_SHELL: 'bash' }, 'win32', 'posix'],
    ['an unknown override', { SIGIL_SHELL: 'fish', PSModulePath: user }, 'win32', 'powershell'],
  ];
  for (const [name, env, platform, expected] of cases) {
    it(`should say ${expected} for ${name}`, () => {
      assert.equal(detectShell(env, platform), expected);
    });
  }
});

describe('printEquivalentCommand in a terminal', () => {
  for (const columns of [40, 60, 120, undefined]) {
    it(`should print the command flush-left, wrapped only when it must (${columns ?? 'no'} columns)`, async () => {
      const rec = await printed(LONG, columns);
      assert.equal(rec.copied.length, 1);
      const lines = stripAnsi(rec.copied[0] ?? '').split('\n');
      assert.doesNotMatch(rec.copied[0] ?? '', /│/);
      for (const line of lines) {
        assert.match(line, /^ {3}\S/);
        if (columns !== undefined && line.trim().includes(' '))
          assert.ok(line.length <= columns - 1, `${columns}: ${JSON.stringify(line)}`);
      }
      assert.equal(unwrap(lines, detectShell()), LONG);
      if (columns === undefined || columns > LONG.length) assert.equal(lines.length, 1);
      else assert.ok(lines.length > 1);
    });
  }

  it('should name the shell and say to copy every line only when it wraps', async () => {
    const narrow = stripAnsi((await printed(LONG, 60)).logs.join('\n')).replace(/\s+/g, ' ');
    const wide = stripAnsi((await printed(LONG, 2000)).logs.join('\n'));
    assert.match(
      narrow,
      /Repeat non-interactively for .+ \(copy all \d+ lines; SIGIL_SHELL changes this\):/,
    );
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

  it('should hold no quote, continuation or newline before it is wrapped', () => {
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
  const cli = 'C:\\work\\sigil\\dist-cli\\cli.js';
  const cases: Array<[string, NodeJS.ProcessEnv, string, string]> = [
    ['npm run sigil', viaScript, cli, 'node C:/work/sigil/dist-cli/cli.js'],
    [
      'a posix path',
      viaScript,
      '/home/a/sigil/dist-cli/cli.js',
      'node /home/a/sigil/dist-cli/cli.js',
    ],
    ['a path with a space', viaScript, 'C:\\My Work\\cli.js', 'node "C:/My Work/cli.js"'],
    ['a path with a dollar', viaScript, 'C:\\a$b\\cli.js', 'npm run sigil --'],
    ['a path with a percent', viaScript, 'C:\\a%b\\cli.js', 'npm run sigil --'],
    ['no script path', viaScript, '', 'npm run sigil --'],
    [
      'a differently named script',
      { ...viaScript, npm_lifecycle_event: 'cli' },
      cli,
      'node C:/work/sigil/dist-cli/cli.js',
    ],
    ['npm test', npmTest, cli, 'sigil'],
    ['npx', { npm_command: 'exec', npm_lifecycle_event: 'npx' }, cli, 'sigil'],
    ['an install on PATH', {}, cli, 'sigil'],
    ['a script with no name', { ...viaScript, npm_lifecycle_event: '' }, cli, 'sigil'],
  ];

  for (const [name, env, script, expected] of cases) {
    it(`should give "${expected}" for ${name}`, () => {
      assert.equal(launcherPrefix(env, script), expected);
    });
  }

  it('should replace only the leading sigil of a command', () => {
    assert.equal(
      withLauncher('sigil add rule:sigil/x --yes', viaScript, cli),
      'node C:/work/sigil/dist-cli/cli.js add rule:sigil/x --yes',
    );
    assert.equal(withLauncher('sigilx add', viaScript, cli), 'sigilx add');
    assert.equal(withLauncher('sigil add x', {}, cli), 'sigil add x');
  });
});

describe('a quoted launcher path', () => {
  const quoted = withLauncher(
    LONG,
    {
      npm_command: 'run-script',
      npm_lifecycle_event: 'sigil',
      npm_lifecycle_script: 'node dist-cli/cli.js',
    },
    'C:\\Program Files\\sigil\\dist-cli\\cli.js',
  );
  for (const shell of ALL_SHELLS) {
    for (const width of [30, 60, 100]) {
      it(`should never break inside the quotes (${shell}, ${width} columns)`, () => {
        const lines = wrapCommand(quoted, width, shell);
        assert.equal(unwrap(lines, shell), quoted);
        for (const line of lines) assert.equal((line.match(/"/g) ?? []).length % 2, 0, line);
      });
    }
  }
});

describe('the printed block runs when pasted', () => {
  const cli = path.resolve(__dirname, '../../dist-cli/cli.js');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-paste-'));
  const launcher = launcherPrefix(
    {
      npm_command: 'run-script',
      npm_lifecycle_event: 'sigil',
      npm_lifecycle_script: 'node dist-cli/cli.js',
    },
    cli,
  );
  const shells: Array<[Shell, string, string[]]> = [
    ['powershell', 'powershell', ['-NoProfile', '-NonInteractive', '-Command']],
    ['posix', 'bash', ['-c']],
  ];
  for (const [shell, exe, args] of shells) {
    it(`should exit 0 in ${exe} from a folder with no package.json`, t => {
      if (spawnSync(exe, [...args, 'exit 0']).status !== 0) return t.skip(`${exe} not available`);
      const lines = wrapCommand(`${launcher} --version`, 30, shell);
      assert.ok(lines.length > 1);
      const block = lines.map(line => `   ${line}`).join('\n');
      const run = spawnSync(exe, [...args, block], { cwd: folder, encoding: 'utf8' });
      assert.equal(run.status, 0, `${run.stderr}${run.stdout}`);
    });
  }
});

describe('printSkippedAdvice', () => {
  it('should report an artifact already delivered as information, and any other skip as a warning', () => {
    const rec = createRecorder();
    const restore = mockClack([], rec);
    try {
      printSkippedAdvice([
        { id: 'shared/clean-code', kind: 'rule', reason: 'inlined into a/b', cause: 'inlined' },
        { id: 'x/y', kind: 'hook', reason: 'not supported', cause: 'unsupported' },
      ]);
    } finally {
      restore();
    }
    assert.equal(rec.logs.length, 2);
    assert.match(rec.logs[0] ?? '', /^info: Already inside another pick/);
    assert.match(rec.logs[1] ?? '', /^warn: 1 artifact\(s\) skipped/);
  });
});
