/**
 * The four prompts on `@clack/core`, driven with real key presses through in-memory streams: the
 * answers must be what clack's prompts gave, an answered prompt must collapse to a short line, and a
 * small window must never see a line wider than itself. (The renderers are also property-tested on
 * their own in `prompt-views.test.ts`; this proves the wiring around them.)
 */
import { after, before, describe, it } from 'node:test';
import tty from 'node:tty';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { isCancel } from '@clack/core';
import { runConfirm, runMultiSelect, runSelect, runText } from '../../dist-cli/wizard/prompt-run';
import { withWindow } from '../helpers/window';

/**
 * @clack/core builds a `tty.WriteStream(0)` as the sink for what is typed, which needs a real
 * terminal on stdin. A test runner has none, so for these tests that one class is a plain Writable.
 */
const realWriteStream = tty.WriteStream;
before(() => {
  class SinkStream extends Writable {
    // readline switches to its line-editing mode when this looks like a terminal, as the real one does
    isTTY = true;
    columns = 80;
    rows = 24;
    constructor() {
      super({ write: (_chunk, _encoding, done) => done() });
    }
  }
  (tty as { WriteStream: unknown }).WriteStream = SinkStream;
});
after(() => {
  (tty as { WriteStream: unknown }).WriteStream = realWriteStream;
});

const DOWN = '\u001b[B';
const RIGHT = '\u001b[C';
const ENTER_KEY = '\r';
const CTRL_C = '\u0003';
const SPACE = ' ';

/** Strips colours and the cursor/erase codes a prompt writes, leaving the text a person reads. */
// eslint-disable-next-line no-control-regex -- ESC introduces the terminal codes being removed
const CODES = /\u001b\[[0-9;?]*[A-Za-z]/g;

function fakeIo() {
  const input = new PassThrough();
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(String(chunk));
      done();
    },
  });
  const press = async (...keys: string[]): Promise<void> => {
    for (const key of keys) {
      await new Promise(resolve => setImmediate(resolve));
      input.write(key);
    }
  };
  const screen = (): string => chunks.join('').replace(CODES, '');
  /** Each frame the prompt drew, on its own: lines are only comparable within one frame. */
  const frames = (): string[] => chunks.map(chunk => chunk.replace(CODES, ''));
  return { io: { input, output }, press, screen, frames };
}

describe('select', () => {
  const options = [
    { value: 'a', label: 'Alpha', hint: 'the first' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' },
  ];

  it('should answer with the value under the cursor, and collapse to the chosen label', async () => {
    const { io, press, screen } = fakeIo();
    const answer = runSelect({ message: 'Pick one', options }, io);
    await press(DOWN, ENTER_KEY);
    assert.equal(await answer, 'b');
    assert.match(screen(), /◇ {2}Pick one\n│ {2}Beta$/m);
  });

  it('should start on the initial value', async () => {
    const { io, press } = fakeIo();
    const answer = runSelect({ message: 'Pick', options, initialValue: 'c' }, io);
    await press(ENTER_KEY);
    assert.equal(await answer, 'c');
  });

  it('should return the cancel symbol on Ctrl+C', async () => {
    const { io, press } = fakeIo();
    const answer = runSelect({ message: 'Pick', options }, io);
    await press(CTRL_C);
    assert.ok(isCancel(await answer));
  });
});

describe('confirm', () => {
  it('should answer yes on Enter when yes is the default', async () => {
    const { io, press } = fakeIo();
    const answer = runConfirm({ message: 'Sure?' }, io);
    await press(ENTER_KEY);
    assert.equal(await answer, true);
  });

  it('should answer no after moving to No, and collapse to the answer', async () => {
    const { io, press, screen } = fakeIo();
    const answer = runConfirm({ message: 'Sure?' }, io);
    await press(RIGHT, ENTER_KEY);
    assert.equal(await answer, false);
    assert.match(screen(), /│ {2}No$/m);
  });

  it('should honour initialValue false and custom labels', async () => {
    const { io, press } = fakeIo();
    const answer = runConfirm(
      { message: 'Sure?', initialValue: false, active: 'Do it', inactive: 'Skip' },
      io,
    );
    await press(ENTER_KEY);
    assert.equal(await answer, false);
  });
});

describe('multiselect', () => {
  const options = Array.from({ length: 30 }, (_, i) => ({
    value: `item-${i}`,
    label: `typescript/ts-a-long-artifact-name-${i}`,
    hint: 'rule · up to date',
  }));

  it('should return the ticked values and collapse to a count, not a list of ids', async () => {
    const { io, press, screen } = fakeIo();
    const answer = runMultiSelect({ message: 'Remove which?', options }, io);
    await press(SPACE, DOWN, SPACE, DOWN, SPACE, DOWN, SPACE, ENTER_KEY);
    assert.deepEqual(await answer, ['item-0', 'item-1', 'item-2', 'item-3']);
    assert.match(screen(), /│ {2}4 selected$/m);
    assert.doesNotMatch(screen(), /ts-a-long-artifact-name-1, /);
  });

  it('should name the choice when only a few are ticked', async () => {
    const { io, press, screen } = fakeIo();
    const answer = runMultiSelect({ message: 'Which?', options }, io);
    await press(SPACE, ENTER_KEY);
    await answer;
    assert.match(screen(), /1 selected: typescript\/ts-a-long-artifact-name-0/);
  });

  it('should refuse an empty answer when required, then accept one', async () => {
    const { io, press, screen } = fakeIo();
    const answer = runMultiSelect({ message: 'Which?', options }, io);
    await press(ENTER_KEY, SPACE, ENTER_KEY);
    assert.deepEqual(await answer, ['item-0']);
    assert.match(screen(), /Please select at least one option/);
  });

  it('should accept an empty answer when not required', async () => {
    const { io, press } = fakeIo();
    const answer = runMultiSelect({ message: 'Which?', options, required: false }, io);
    await press(ENTER_KEY);
    assert.deepEqual(await answer, []);
  });

  it('should return the cancel symbol on Ctrl+C', async () => {
    const { io, press } = fakeIo();
    const answer = runMultiSelect({ message: 'Which?', options }, io);
    await press(CTRL_C);
    assert.ok(isCancel(await answer));
  });
});

describe('text', () => {
  it('should return what was typed', async () => {
    const { io, press } = fakeIo();
    const answer = runText({ message: 'Name?' }, io);
    await press(...'hello', ENTER_KEY);
    assert.equal(await answer, 'hello');
  });

  it('should start from the initial value, and fall back to the default when left empty', async () => {
    const first = fakeIo();
    const typed = runText({ message: 'Path', initialValue: 'abc' }, first.io);
    await first.press('d', ENTER_KEY);
    assert.equal(await typed, 'abcd');
    const second = fakeIo();
    const empty = runText({ message: 'Name', defaultValue: 'fallback' }, second.io);
    await second.press(ENTER_KEY);
    assert.equal(await empty, 'fallback');
  });

  it('should show the validation problem and accept a corrected value', async () => {
    const { io, press, screen } = fakeIo();
    const validate = (value: string): string | void => (value.length < 3 ? 'Too short' : undefined);
    const answer = runText({ message: 'Name?', validate }, io);
    await press('a', ENTER_KEY, 'b', 'c', ENTER_KEY);
    assert.equal(await answer, 'abc');
    assert.match(screen(), /Too short/);
  });

  it('should return the cancel symbol on Ctrl+C', async () => {
    const { io, press } = fakeIo();
    const answer = runText({ message: 'Name?' }, io);
    await press(CTRL_C);
    assert.ok(isCancel(await answer));
  });
});

describe('in a small window', () => {
  const LONG = `C:\\Users\\someone\\a\\very\\deep\\folder\\${'nested\\'.repeat(8)}project`;

  it('should keep every line of every prompt inside the window, whatever it is asked', async () => {
    const options = Array.from({ length: 40 }, (_, i) => ({
      value: `v${i}`,
      label: `typescript/ts-a-rather-long-artifact-name-${i}`,
      hint: 'rule · up to date · required by something else as well',
    }));
    await withWindow({ columns: 30, rows: 14 }, async () => {
      const runs = [
        {
          start: (io: ReturnType<typeof fakeIo>['io']) => runSelect({ message: LONG, options }, io),
          keys: [DOWN, DOWN, ENTER_KEY],
        },
        {
          start: (io: ReturnType<typeof fakeIo>['io']) =>
            runMultiSelect({ message: LONG, options }, io),
          keys: [SPACE, DOWN, SPACE, ENTER_KEY],
        },
        {
          start: (io: ReturnType<typeof fakeIo>['io']) => runConfirm({ message: LONG }, io),
          keys: [RIGHT, ENTER_KEY],
        },
        {
          start: (io: ReturnType<typeof fakeIo>['io']) =>
            runText({ message: LONG, initialValue: LONG }, io),
          keys: [...'xyz', ENTER_KEY],
        },
      ];
      for (const { start, keys } of runs) {
        const { io, press, frames } = fakeIo();
        const done = start(io);
        await press(...keys);
        await done;
        for (const line of frames().flatMap(frame => frame.split('\n'))) {
          assert.ok(
            line.length <= 29,
            `a line is ${line.length} columns wide: ${JSON.stringify(line)}`,
          );
        }
      }
    });
  });

  it('should return the whole typed value even though only part of it is shown', async () => {
    await withWindow({ columns: 30, rows: 14 }, async () => {
      const { io, press } = fakeIo();
      const answer = runText({ message: 'Path', initialValue: LONG }, io);
      await press('!', ENTER_KEY);
      assert.equal(await answer, `${LONG}!`);
    });
  });
});
