// Cases for requests/wizard.json. Each runs the project's `depot init` on what looks to it like a
// terminal and answers its questions, or runs it with no terminal as a script would.
import assert from 'node:assert/strict';
import { STOCK, converse, read, run, token } from './kit.mjs';

const FLAGS = ['--name', 'Corner Shop', '--currency', 'EUR'];
const ANSWERS = 'Corner Shop\nEUR\ny\n';
const SECRET = 'tok-9f3a7c21e5';
const store = result => read(result.file)?.store;
const first = text => text.trim().split('\n')[0];

/** A finished setup: it ended by itself, reported success and left the store it was asked for. */
function created(result, want = {}) {
  assert.ok(
    !result.hung,
    `setup never finished; last output: ${first(result.out.split('\n').slice(-2).join(' '))}`,
  );
  assert.equal(result.code, 0, `setup failed: ${first(result.stderr) || first(result.out)}`);
  const made = store(result);
  assert.ok(made, 'setup reported success and wrote no stock file');
  for (const [key, value] of Object.entries({ name: 'Corner Shop', currency: 'EUR', ...want }))
    assert.equal(made[key], value, `the store's ${key} is ${JSON.stringify(made[key])}`);
}

export const CASES = {
  // R1: `depot init` asks for what is missing.
  async 'init-asks'() {
    created(await converse(['init']));
  },
  async 'init-skips-given'() {
    const result = await converse(['init', '--name', 'Flag Shop']);
    created(result, { name: 'Flag Shop' });
    assert.ok(!result.asked.includes('name'), 'the name was given as a flag and still asked for');
  },
  async 'init-asks-again'() {
    created(await converse(['init'], { answers: { currency: ['XXX', 'EUR'] } }));
  },
  async 'init-decline'() {
    const result = await converse(['init'], { answers: { confirm: 'n' } });
    assert.equal(read(result.file), null, 'the answer was no and a stock file was written');
    assert.notEqual(result.code, 0, 'a declined setup reports success');
  },
  async 'init-shows-command'() {
    const result = await converse(['init']);
    const shown = result.out
      .split('\n')
      .some(
        text =>
          /depot init\b/.test(text) &&
          /--name\b.*Corner Shop/.test(text) &&
          /--currency[ =]EUR/.test(text),
      );
    assert.ok(shown, 'the command that does the same without questions is never shown');
  },
  async 'init-no-terminal'() {
    const silent = await run(['init'], { input: null });
    assert.ok(!silent.hung, 'with no terminal it waits for an answer');
    assert.notEqual(silent.code, 0, 'with no terminal and no flags it reports success');
    const piped = await run(['init'], { input: ANSWERS });
    assert.equal(read(piped.file), null, 'answers were read from a pipe');
  },
  async 'init-flags-kept'() {
    const result = await run(['init', ...FLAGS]);
    assert.equal(result.code, 0, `flags alone fail: ${first(result.stderr)}`);
    assert.deepEqual(read(result.file)?.store.name, 'Corner Shop');
  },

  // R2: a new setting, as a flag and as a question.
  async 'low-flag'() {
    const given = await run(['init', ...FLAGS, '--low-stock', '7']);
    assert.equal(store(given)?.lowStock, 7, '--low-stock 7 is not saved as store.lowStock');
    const left = await run(['init', ...FLAGS]);
    assert.equal(store(left)?.lowStock, 5, 'left out, store.lowStock is not 5');
  },
  async 'low-flag-checked'() {
    for (const bad of ['abc', '-1', '2.5']) {
      const result = await run(['init', ...FLAGS, `--low-stock=${bad}`]);
      assert.notEqual(result.code, 0, `--low-stock=${bad} is accepted`);
      assert.equal(read(result.file), null, `--low-stock=${bad} still wrote a stock file`);
    }
  },
  async 'low-asked'() {
    const result = await converse(['init']);
    created(result, { lowStock: 7 });
  },
  async 'low-asked-again'() {
    created(await converse(['init'], { answers: { low: ['abc', '7'] } }), { lowStock: 7 });
  },
  async 'low-flag-skips'() {
    const result = await converse(['init', '--low-stock', '9']);
    created(result, { lowStock: 9 });
    assert.ok(
      !result.asked.includes('low'),
      'the threshold was given as a flag and still asked for',
    );
  },

  // R3: quitting leaves nothing behind.
  async 'quit-leaves-nothing'() {
    const result = await converse(['init'], { quitAfter: 1 });
    assert.equal(read(result.file), null, 'quitting after the first question leaves a stock file');
  },
  async 'decline-leaves-nothing'() {
    const result = await converse(['init'], { answers: { confirm: 'n' } });
    assert.equal(read(result.file), null, 'answering no leaves a stock file');
  },
  async 'setup-still-creates'() {
    created(await converse(['init']));
  },

  // R4: no terminal, no waiting.
  async 'ci-no-hang'() {
    const result = await run(['init', '--name', 'Corner Shop'], { input: null });
    assert.ok(!result.hung, 'with no terminal and a flag missing it waits');
    assert.notEqual(result.code, 0, 'with no terminal and a flag missing it reports success');
    assert.equal(read(result.file), null, 'it wrote a stock file with the currency never given');
  },
  async 'ci-names-flag'() {
    const result = await run(['init', '--name', 'Corner Shop'], { input: null, timeout: 3000 });
    assert.match(result.stderr, /--currency/, 'the message does not name the missing flag');
  },
  async 'ci-no-piped-answers'() {
    const result = await run(['init'], { input: ANSWERS });
    assert.equal(read(result.file), null, 'with no terminal, answers were read from a pipe');
  },
  async 'terminal-still-asks'() {
    created(await converse(['init']));
  },

  // R5: a secret among the answers.
  async 'token-saved'() {
    const result = await converse(['init'], { answers: { token: SECRET } });
    created(result);
    assert.equal(token(result.place), SECRET, 'the token typed during setup was not saved');
  },
  async 'token-not-shown'() {
    const result = await converse(['init'], { answers: { token: SECRET } });
    assert.ok(result.asked.includes('token'), 'setup never asked for the token');
    assert.ok(!result.out.includes(SECRET), 'the token is printed back on the screen');
  },
  async 'token-not-a-flag'() {
    for (const flag of ['--sync-token', '--token', '--cloud-token', '--sync_token']) {
      const result = await run(['init', ...FLAGS, flag, SECRET]);
      assert.notEqual(
        token(result.place),
        SECRET,
        `the token can be passed as ${flag}, where a process list shows it`,
      );
    }
  },
  async 'token-optional'() {
    const result = await converse(['init']);
    created(result);
    assert.ok(!token(result.place), 'no token was typed and one was saved');
  },

  // Q1: a command-line change that is not setup.
  async 'list-by-warehouse'() {
    const annex = await run(['item', 'list', '--warehouse', 'annex'], { db: STOCK });
    assert.equal(annex.code, 0);
    assert.ok(
      annex.stdout.includes('Lamp') && !annex.stdout.includes('Kettle'),
      '--warehouse annex does not filter',
    );
    const all = await run(['item', 'list'], { db: STOCK });
    assert.match(all.stdout, /Kettle[^]*Lamp/, 'the unfiltered listing lost items');
  },
};
