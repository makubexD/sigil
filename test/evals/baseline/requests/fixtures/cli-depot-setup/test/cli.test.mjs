import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/depot.mjs', import.meta.url));

function depot(args, db) {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'depot-')), 'depot.json');
  if (db) writeFileSync(file, JSON.stringify(db));
  const run = spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    env: { ...process.env, DEPOT_DB: file },
  });
  return { ...run, file };
}

const STOCK = {
  store: { name: 'Corner Shop', currency: 'EUR' },
  warehouses: [{ name: 'main' }, { name: 'annex' }],
  items: [{ id: 'i1', name: 'Kettle', qty: 3, warehouse: 'main' }],
};

test('item list shows the items', () => {
  const run = depot(['item', 'list'], STOCK);
  assert.equal(run.status, 0);
  assert.match(run.stdout, /Kettle/);
});

test('warehouse show-all lists the warehouses', () => {
  const run = depot(['warehouse', 'show-all'], STOCK);
  assert.equal(run.stdout, 'main\nannex\n');
});

test('init creates the stock file', () => {
  const run = depot(['init', '--name', 'Corner Shop', '--currency', 'EUR']);
  assert.equal(run.status, 0);
  assert.match(run.stdout, /Created/);
});

test('init refuses an unknown currency', () => {
  const run = depot(['init', '--name', 'Corner Shop', '--currency', 'XXX']);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^error: /);
});
