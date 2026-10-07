import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = fileURLToPath(new URL('../launch.mjs', import.meta.url));

function launch(cwd, ...args) {
  return spawnSync(process.execPath, [ENTRY, ...args], { cwd, encoding: 'utf8', input: '' });
}

test('create, add, list and delete through the real entry point', () => {
  const dir = mkdtempSync(join(tmpdir(), 'launch-'));
  assert.equal(launch(dir, 'project', 'create', 'demo', '--template', 'api').status, 0);
  assert.equal(launch(dir, 'env', 'add', 'staging', '--region', 'eu').status, 0);
  assert.equal(launch(dir, 'env', 'list').stdout, 'staging\teu\tfree\n');
  assert.equal(launch(dir, 'env', 'delete', 'staging').status, 2);
  assert.equal(launch(dir, 'env', 'delete', 'staging', '--yes').status, 0);
});

test('usage errors exit 2 on stderr', () => {
  const dir = mkdtempSync(join(tmpdir(), 'launch-'));
  const result = launch(dir, 'project', 'create', 'Bad Name');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /^error: invalid name/);
  assert.equal(result.stdout, '');
});
