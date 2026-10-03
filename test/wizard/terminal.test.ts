/**
 * Fitting text to the window: wrapping never loses text and never exceeds the width, and a cut ends
 * in an ellipsis. The properties run over every width from the layout floor to a wide terminal and
 * over text shaped like what sigil prints (long paths, a 300-character command, coloured labels).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_WIDTH,
  describeTerminal,
  fitLine,
  terminalHeight,
  terminalWidth,
  visibleLength,
  watchWindowSize,
  wrapText,
} from '../../dist-cli/wizard/terminal';
import { stripAnsi } from '../helpers/ansi';

const WIDTHS = Array.from({ length: 181 }, (_, i) => MIN_WIDTH + i);
const RED = '\u001b[31m';
const CYAN = '\u001b[36m';
const COLOUR_OFF = '\u001b[39m';
const ARTIFACTS = ['typescript/ts-code-reviewer', 'shared/cli', 'agent:typescript/ts-debugger'];
const LONG_COMMAND = `sigil add ${Array.from({ length: 12 }, (_, i) => `rule:typescript/ts-rule-number-${i}`).join(' ')} --target claude --overwrite --yes`;
const LONG_PATH =
  'C:\\WorkSpaceMaku\\Others\\sigil\\.claude\\agents\\ts-performance-profiler-with-a-very-long-name.md';

const SHORT_SEGMENT_PATH = 'C:\\Work\\Space\\Maku\\Others\\sigil\\.claude\\agents\\debugger.md';

const SAMPLES: Record<string, string> = {
  prose:
    'Nothing is written until you confirm at the end. Every step has a Back row, and Ctrl+C cancels.',
  command: LONG_COMMAND,
  path: `  ${LONG_PATH}  (overwritten)`,
  posix: '  .claude/agents/ts-performance-profiler-with-a-very-long-name-that-never-ends.md',
  indented:
    '    skill         typescript/ts-generate-tests  (dependency of typescript/ts-sync-tests, shared/cli)',
  coloured: `${RED}${LONG_COMMAND}${'\u001b[39m'}`,
  blank:
    'first line\n\nsecond line after a blank one that is long enough to need wrapping at narrow widths',
  one: ARTIFACTS.join(' '),
};

/** Text with every whitespace removed: wrapping may move and split words, never change letters. */
const compact = (text: string): string => stripAnsi(text).replace(/\s+/g, '');

describe('wrapText', () => {
  for (const [name, sample] of Object.entries(SAMPLES)) {
    it(`should keep every line within the width and lose no text (${name})`, () => {
      for (const width of WIDTHS) {
        const wrapped = wrapText(sample, width);
        for (const line of wrapped.split('\n')) {
          assert.ok(visibleLength(line) <= width, `width ${width}: ${JSON.stringify(line)}`);
        }
        assert.equal(compact(wrapped), compact(sample), `width ${width}`);
      }
    });
  }

  it('should leave text that already fits exactly as it was', () => {
    for (const sample of Object.values(SAMPLES)) {
      const width = Math.max(...sample.split('\n').map(visibleLength));
      assert.equal(wrapText(sample, Math.max(width, MIN_WIDTH)), sample);
    }
  });

  it('should keep a wrapped line at the level of its first row', () => {
    for (const indent of [0, 2, 4]) {
      const lines = wrapText(`${' '.repeat(indent)}${'word '.repeat(30)}`, 40).split('\n');
      assert.ok(lines.length > 2);
      for (const line of lines) assert.match(line, new RegExp(`^ {${indent}}word`));
    }
  });

  it('should keep blank lines', () => {
    assert.deepEqual(wrapText('a\n\nb', MIN_WIDTH).split('\n'), ['a', '', 'b']);
  });

  it('should split a path after a separator when it can', () => {
    const lines = wrapText(SHORT_SEGMENT_PATH, 30).split('\n');
    assert.ok(
      lines.slice(0, -1).every(line => /[\\/]$/.test(line)),
      JSON.stringify(lines),
    );
  });

  it('should treat a width below the floor as the floor, and still finish', () => {
    for (const width of [-5, 0, 1, 3, 19]) {
      const wrapped = wrapText(LONG_COMMAND, width);
      assert.equal(compact(wrapped), compact(LONG_COMMAND));
      assert.ok(wrapped.split('\n').every(line => visibleLength(line) <= MIN_WIDTH));
    }
  });

  it('should never split a colour code when it wraps coloured text', () => {
    const wrapped = wrapText(SAMPLES['coloured'] as string, 30);
    // eslint-disable-next-line no-control-regex -- ESC marks the colour codes that must stay whole
    assert.doesNotMatch(wrapped, /\u001b(?!\[\d+m)/);
    assert.ok(wrapped.includes(RED));
  });

  it('should survive an indentation as wide as the window', () => {
    const wrapped = wrapText(`${' '.repeat(60)}tail of a line with several words`, 30);
    assert.ok(wrapped.split('\n').every(line => visibleLength(line) <= 30));
    assert.equal(compact(wrapped), 'tailofalinewithseveralwords');
  });
});

describe('fitLine', () => {
  it('should return text that fits untouched', () => {
    assert.equal(fitLine('short', 10), 'short');
    assert.equal(fitLine('exactly10!', 10), 'exactly10!');
  });

  it('should cut to the width and end in an ellipsis, keeping the start', () => {
    for (const width of [1, 2, 5, 12, 40]) {
      const cut = fitLine(SAMPLES['prose'] as string, width);
      assert.equal(visibleLength(cut), width, `width ${width}`);
      assert.ok(cut.endsWith('…'));
      assert.ok((SAMPLES['prose'] as string).startsWith(cut.slice(0, -1)));
    }
  });

  it('should give nothing when there is no room', () => {
    assert.equal(fitLine('text', 0), '');
    assert.equal(fitLine('text', -3), '');
  });

  it('should count colour codes as zero and close a colour it cuts through', () => {
    const cut = fitLine(`${CYAN}a long coloured sentence${COLOUR_OFF}`, 10);
    assert.equal(visibleLength(cut), 10);
    assert.equal(stripAnsi(cut), 'a long co…');
    assert.ok(cut.includes('\u001b[0m'));
  });
});

describe('the live window size', () => {
  type Fake = { columns?: number; rows?: number; isTTY?: boolean; _refreshSize?: () => void };
  const out = process.stdout as unknown as Fake;
  const keys = ['columns', 'rows', 'isTTY', '_refreshSize'] as const;

  /** Runs `fn` with `process.stdout` shaped like a terminal that Node has a stale size for. */
  async function withStaleTerminal(
    stale: { columns: number; rows: number },
    real: { columns: number; rows: number } | undefined,
    fn: (refreshes: () => number) => Promise<void> | void,
  ): Promise<void> {
    const had = keys.map(key => Object.getOwnPropertyDescriptor(out, key));
    let refreshed = 0;
    Object.defineProperty(out, 'columns', {
      value: stale.columns,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(out, 'rows', { value: stale.rows, configurable: true, writable: true });
    Object.defineProperty(out, 'isTTY', { value: true, configurable: true, writable: true });
    Object.defineProperty(out, '_refreshSize', {
      value: real
        ? () => {
            refreshed += 1;
            out.columns = real.columns;
            out.rows = real.rows;
          }
        : undefined,
      configurable: true,
      writable: true,
    });
    try {
      await fn(() => refreshed);
    } finally {
      keys.forEach((key, i) => {
        const original = had[i];
        if (original) Object.defineProperty(out, key, original);
        else delete out[key];
      });
    }
  }

  it('should re-read the real size, because Node keeps a stale one in some Windows terminals', async () => {
    await withStaleTerminal({ columns: 257, rows: 30 }, { columns: 230, rows: 28 }, () => {
      assert.equal(terminalWidth(), 230);
      assert.equal(terminalHeight(), 28);
    });
  });

  it('should fall back to the cached size when the terminal cannot be re-read', async () => {
    await withStaleTerminal({ columns: 120, rows: 40 }, undefined, () => {
      assert.equal(terminalWidth(), 120);
      assert.equal(terminalHeight(), 40);
    });
  });

  it('should report no window when there is no terminal', async () => {
    await withStaleTerminal({ columns: 0, rows: 0 }, undefined, () => {
      assert.equal(terminalWidth(), undefined);
      assert.equal(terminalHeight(), undefined);
    });
  });

  it('should let SIGIL_COLUMNS override a terminal that reports the wrong size, and ignore a bad value', async () => {
    const before = process.env['SIGIL_COLUMNS'];
    try {
      await withStaleTerminal({ columns: 257, rows: 30 }, { columns: 230, rows: 28 }, () => {
        process.env['SIGIL_COLUMNS'] = '100';
        assert.equal(terminalWidth(), 100);
        for (const bad of ['0', '-4', 'wide', '12.5', '']) {
          process.env['SIGIL_COLUMNS'] = bad;
          assert.equal(terminalWidth(), 230, `value ${JSON.stringify(bad)}`);
        }
      });
    } finally {
      if (before === undefined) delete process.env['SIGIL_COLUMNS'];
      else process.env['SIGIL_COLUMNS'] = before;
    }
  });

  it('should show cached and live sizes for SIGIL_DEBUG=terminal', async () => {
    await withStaleTerminal({ columns: 257, rows: 30 }, { columns: 230, rows: 28 }, () => {
      assert.equal(
        describeTerminal(),
        'terminal: cached 257x30, live 230x28, SIGIL_COLUMNS not set',
      );
    });
  });

  it('should keep re-reading while a prompt is open, and stop when it closes', async () => {
    await withStaleTerminal(
      { columns: 80, rows: 24 },
      { columns: 70, rows: 24 },
      async refreshes => {
        const stop = watchWindowSize();
        await new Promise(resolve => setTimeout(resolve, 520));
        stop();
        const seen = refreshes();
        assert.ok(seen >= 2, `re-read ${seen} times`);
        await new Promise(resolve => setTimeout(resolve, 300));
        assert.equal(refreshes(), seen, 'it kept running after it was stopped');
      },
    );
  });

  it('should not start a timer without a terminal', async () => {
    await withStaleTerminal(
      { columns: 80, rows: 24 },
      { columns: 70, rows: 24 },
      async refreshes => {
        out.isTTY = false;
        const stop = watchWindowSize();
        await new Promise(resolve => setTimeout(resolve, 300));
        stop();
        assert.equal(refreshes(), 0);
      },
    );
  });
});
