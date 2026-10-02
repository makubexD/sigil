/**
 * The home menu's single frame: `intro`, `outro` and `cancel` open or close a frame only at the top
 * level, and `withGutter` keeps plain `console` output inside the `│` gutter. Also a source scan that
 * stops a new call site from importing them straight from clack.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  cancel,
  gutterLines,
  intro,
  noteOnce,
  outro,
  runInHomeFrame,
  withGutter,
} from '../../dist-cli/wizard/frame';
import { createRecorder, mockClack } from '../helpers/clack-mock';
import { stripAnsi } from '../helpers/ansi';

const SRC = path.resolve(__dirname, '../../src');
const FRAME_OWNERS = new Set(['wizard/frame.ts', 'wizard/home.ts']);
const CLACK_FRAME_IMPORT =
  /import\s*\{[^}]*\b(intro|outro|cancel)\b[^}]*\}\s*from\s*'@clack\/prompts'/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('frame functions at the top level', () => {
  it('should open and close clack frames when no home menu owns the frame', () => {
    const rec = createRecorder();
    const restore = mockClack([], rec);
    try {
      intro('title');
      cancel('stopped');
      outro('done');
    } finally {
      restore();
    }
    assert.deepEqual(rec.frames, ['intro: title', 'cancel: stopped', 'outro: done']);
  });
});

describe('frame functions inside the home menu', () => {
  it('should draw no second frame: intro is silent, outro and cancel become log lines', async () => {
    const rec = createRecorder();
    const restore = mockClack([], rec);
    try {
      await runInHomeFrame(async () => {
        intro('title');
        cancel('stopped');
        outro('done');
      });
    } finally {
      restore();
    }
    assert.deepEqual(rec.frames, []);
    assert.deepEqual(rec.logs, ['warn: stopped', 'step: done']);
  });

  it('should show a keyed note once per session, and every time at the top level', async () => {
    const rec = createRecorder();
    const restore = mockClack([], rec);
    try {
      await runInHomeFrame(async () => {
        noteOnce('k', 'body', 'Title');
        noteOnce('k', 'body', 'Title');
      });
      noteOnce('k', 'body', 'Title');
      noteOnce('k', 'body', 'Title');
    } finally {
      restore();
    }
    assert.equal(rec.notes.length, 3);
  });

  it('should start a new session with an empty memory of shown notes', async () => {
    const rec = createRecorder();
    const restore = mockClack([], rec);
    try {
      await runInHomeFrame(async () => noteOnce('k', 'body', 'Title'));
      await runInHomeFrame(async () => noteOnce('k', 'body', 'Title'));
    } finally {
      restore();
    }
    assert.equal(rec.notes.length, 2);
  });
});

describe('gutterLines', () => {
  it('should put the bar before every line and turn a blank line into a bare bar', () => {
    const out = stripAnsi(gutterLines('first\n\n  second'));
    assert.equal(out, '│  first\n│\n│    second');
  });
});

describe('withGutter', () => {
  const written: string[] = [];
  const names = ['log', 'info', 'warn', 'error'] as const;

  async function capture(fn: () => Promise<void>): Promise<void> {
    const originals = names.map(name => console[name]);
    written.length = 0;
    for (const name of names) console[name] = (text: unknown) => void written.push(String(text));
    try {
      await fn();
    } finally {
      names.forEach((name, i) => (console[name] = originals[i]!));
    }
  }

  it('should prefix console output inside the menu, with format arguments applied', async () => {
    await capture(() =>
      runInHomeFrame(() =>
        withGutter(async () => {
          console.log('%s has %d', 'sigil', 3);
          console.warn('careful\n');
          console.error('bad');
          console.info('fyi');
        }),
      ),
    );
    assert.deepEqual(written.map(stripAnsi), [
      '│  sigil has 3',
      '│  careful\n│',
      '│  bad',
      '│  fyi',
    ]);
  });

  it('should leave console output alone outside the home menu', async () => {
    await capture(() =>
      withGutter(async () => {
        console.log('plain');
      }),
    );
    assert.deepEqual(written, ['plain']);
  });

  it('should restore the console even when the function throws', async () => {
    const before = names.map(name => console[name]);
    await capture(async () => {
      const inner = names.map(name => console[name]);
      await assert.rejects(
        runInHomeFrame(() =>
          withGutter(async () => {
            throw new Error('boom');
          }),
        ),
        /boom/,
      );
      assert.deepEqual(
        names.map(name => console[name]),
        inner,
      );
    });
    assert.deepEqual(
      names.map(name => console[name]),
      before,
    );
  });
});

describe('source scan', () => {
  it('should import intro, outro and cancel only through wizard/frame.ts', () => {
    const offenders = sourceFiles(SRC)
      .map(file => path.relative(SRC, file).split(path.sep).join('/'))
      .filter(rel => !FRAME_OWNERS.has(rel))
      .filter(rel => CLACK_FRAME_IMPORT.test(fs.readFileSync(path.join(SRC, rel), 'utf8')));
    assert.deepEqual(offenders, []);
  });
});
