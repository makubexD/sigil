import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readUserFile } from '../src/user-files.ts';

// root/
//   secret.txt
//   files/report.txt, files/2026/q1/summary.txt   <- the base directory
//   files-evil/x.txt                               <- a sibling whose name starts with "files"
let root = '';
let base = '';

before(() => {
  root = mkdtempSync(path.join(tmpdir(), 'c6-'));
  base = path.join(root, 'files');
  mkdirSync(path.join(base, '2026', 'q1'), { recursive: true });
  mkdirSync(path.join(root, 'files-evil'));
  writeFileSync(path.join(root, 'secret.txt'), 'secret');
  writeFileSync(path.join(base, 'report.txt'), 'report');
  writeFileSync(path.join(base, '2026', 'q1', 'summary.txt'), 'summary');
  writeFileSync(path.join(root, 'files-evil', 'x.txt'), 'evil');
});

after(() => rmSync(root, { recursive: true, force: true }));

test('reads a file directly inside the base directory', async () => {
  assert.equal(await readUserFile(base, 'report.txt'), 'report');
});

test('reads a nested file', async () => {
  assert.equal(await readUserFile(base, '2026/q1/summary.txt'), 'summary');
});

test('reads a name that climbs but stays inside', async () => {
  assert.equal(await readUserFile(base, '2026/../report.txt'), 'report');
});

test('rejects a name that climbs out of the base directory', async () => {
  await assert.rejects(readUserFile(base, '../secret.txt'), RangeError);
  await assert.rejects(readUserFile(base, '2026/../../secret.txt'), RangeError);
});

test('rejects an absolute name', async () => {
  await assert.rejects(readUserFile(base, path.join(root, 'secret.txt')), RangeError);
});

test('rejects a sibling directory whose name starts with the base name', async () => {
  await assert.rejects(readUserFile(base, '../files-evil/x.txt'), RangeError);
});
