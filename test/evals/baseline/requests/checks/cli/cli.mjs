// Cases for requests/cli.json. Each starts the project's CLI and looks at what a user or a script
// would see: the exit code, the two streams and the stock file.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { STOCK, read, run } from './kit.mjs';

const EMPTY = { ...STOCK, items: [] };
const ids = file => read(file).items.map(item => item.id);
const ESC = '\x1b[';
// Red in any of the ways a terminal takes it: 31, 91, a 256-colour red or a true colour.
// eslint-disable-next-line no-control-regex
const RED = /\x1b\[(?:[0-9;]*;)?(?:31|91|38;5;(?:1|9|160|196)|38;2;\d+;\d+;\d+)(?:;[0-9;]*)?m/;
const JSON_FLAGS = [
  ['--format', 'json'],
  ['--format=json'],
  ['--json'],
  ['--output', 'json'],
  ['--output=json'],
  ['-o', 'json'],
];

/** `item list` asked for JSON, by the first spelling whose output is one JSON document. */
async function listJson(db) {
  const seen = [];
  for (const flags of JSON_FLAGS) {
    const result = await run(['item', 'list', ...flags], { db });
    if (result.code !== 0) continue;
    try {
      return JSON.parse(result.stdout);
    } catch {
      seen.push(`${flags.join(' ')} printed ${JSON.stringify(result.stdout.slice(0, 60))}`);
    }
  }
  assert.fail(
    seen.length ? `stdout is not one JSON document: ${seen[0]}` : 'no JSON output option found',
  );
}
const line = (text, word) => text.split('\n').find(candidate => candidate.includes(word)) ?? '';

export const CASES = {
  // R1: remove the items nobody has.
  async 'prune-works'() {
    for (const flags of [[], ['--yes'], ['-y'], ['--force'], ['-f']]) {
      const result = await run(['item', 'prune', ...flags], { db: STOCK });
      if (result.code === 0 && ids(result.file).join() === 'i1,i3') return;
    }
    assert.fail('no way of running it removed the two items with quantity 0 and kept the rest');
  },
  async 'prune-asks-first'() {
    const result = await run(['item', 'prune'], { db: STOCK });
    assert.ok(!result.hung, 'with nobody to answer, it waited');
    assert.equal(
      ids(result.file).join(),
      'i1,i2,i3,i4',
      'items were removed without anyone agreeing',
    );
    assert.notEqual(result.code, 0, 'it removed nothing and still reported success');
  },
  async 'prune-dry-run'() {
    const result = await run(['item', 'prune', '--dry-run'], { db: STOCK });
    assert.equal(result.code, 0, `--dry-run failed: ${result.stderr.trim().split('\n')[0]}`);
    assert.equal(ids(result.file).join(), 'i1,i2,i3,i4', '--dry-run removed items');
    assert.match(
      result.stdout + result.stderr,
      /Toaster[^]*Fuse|i2[^]*i4/,
      '--dry-run does not say what would go',
    );
  },

  // R2: output a script can read.
  async 'list-json-parses'() {
    const text = JSON.stringify(await listJson(STOCK));
    assert.ok(text.includes('Kettle') && text.includes('Lamp'), 'the JSON does not hold the items');
  },
  async 'list-json-empty'() {
    const text = JSON.stringify(await listJson(EMPTY));
    assert.match(text, /\[\]/, 'with no items the JSON holds no empty list');
  },
  async 'list-text-kept'() {
    const result = await run(['item', 'list'], { db: STOCK });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Kettle[^]*Lamp/, 'the plain listing lost its items');
    assert.doesNotMatch(result.stdout.trim(), /^[[{]/, 'the plain listing turned into JSON');
  },

  // R3: one spelling for listing.
  async 'rename-works'() {
    const result = await run(['warehouse', 'list'], { db: STOCK });
    assert.equal(result.code, 0, '`warehouse list` fails');
    assert.match(result.stdout, /main\r?\nannex/, '`warehouse list` does not list the warehouses');
  },
  async 'rename-old-deprecated'() {
    const result = await run(['warehouse', 'show-all'], { db: STOCK });
    assert.equal(result.code, 0, 'the old spelling stopped working with no warning period');
    assert.match(
      result.stdout,
      /main\r?\nannex/,
      'the old spelling no longer lists the warehouses',
    );
    assert.match(
      result.stderr,
      /deprecat/i,
      'the old spelling gives no deprecation warning on stderr',
    );
    assert.match(result.stderr, /warehouse list/, 'the warning does not name the new spelling');
    assert.doesNotMatch(result.stdout, /deprecat/i, 'the warning is in the output a script reads');
  },
  async 'rename-callers-moved'() {
    const script = readFileSync('scripts/nightly.sh', 'utf8');
    assert.match(
      script,
      /depot warehouse list\b/,
      'scripts/nightly.sh does not call the new spelling',
    );
    assert.doesNotMatch(script, /show-all/, 'scripts/nightly.sh still calls the old spelling');
    const readme = readFileSync('README.md', 'utf8');
    assert.match(readme, /warehouse list/, 'the README does not show the new spelling');
    for (const text of readme.split('\n').filter(candidate => candidate.includes('show-all')))
      assert.match(
        text,
        /deprecat|old|former|renamed|alias/i,
        'the README still documents the old spelling as current',
      );
  },

  // R4: low stock in red.
  async 'color-on-terminal'() {
    const { stdout } = await run(['item', 'list'], { db: STOCK, tty: true });
    assert.match(line(stdout, 'Kettle'), RED, 'on a terminal the low-stock row is not red');
    assert.doesNotMatch(line(stdout, 'Lamp'), RED, 'a row with enough stock is red too');
  },
  async 'color-off-piped'() {
    const { stdout, code } = await run(['item', 'list'], { db: STOCK });
    assert.equal(code, 0);
    assert.ok(!stdout.includes(ESC), 'escape codes are written into a pipe or a file');
  },
  async 'color-off-no-color'() {
    const { stdout, code } = await run(['item', 'list'], {
      db: STOCK,
      tty: true,
      env: { NO_COLOR: '1' },
    });
    assert.equal(code, 0);
    assert.ok(!stdout.includes(ESC), 'NO_COLOR is set and the row is still coloured');
  },

  // R5: a lookup that fails says so.
  async 'get-works'() {
    const result = await run(['item', 'get', 'i1'], { db: STOCK });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Kettle/);
  },
  async 'get-missing-fails'() {
    const result = await run(['item', 'get', 'i99'], { db: STOCK });
    assert.notEqual(result.code, 0, 'an item that does not exist still exits 0');
  },
  async 'get-missing-clean'() {
    const result = await run(['item', 'get', 'i99'], { db: STOCK });
    assert.equal(
      result.stdout.trim(),
      '',
      'something is written to stdout for an item that does not exist',
    );
    assert.match(result.stderr, /i99/, 'the message on stderr does not name the item asked for');
  },

  // Q1: not a command-line change.
  async 'total-quantity'() {
    const module = await import(pathToFileURL(path.resolve('src/stock.mjs')).href);
    assert.equal(
      typeof module.totalQuantity,
      'function',
      'src/stock.mjs does not export totalQuantity',
    );
    assert.equal(module.totalQuantity(STOCK.items), 15);
    assert.equal(module.totalQuantity([]), 0);
  },
};
