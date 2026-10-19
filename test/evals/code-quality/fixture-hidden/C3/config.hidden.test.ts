import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';

const DEFAULTS = { host: 'localhost', port: 8080, logLevel: 'info' };

let dir = '';
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cq-config-'));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function file(name: string, content: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, content);
  return path;
}

async function loadError(path: string): Promise<Error> {
  const error = await loadConfig(path).then(
    config => assert.fail(`expected a rejection, got ${JSON.stringify(config)}`),
    (e: unknown) => e,
  );
  assert.ok(error instanceof Error, 'rejects with an Error');
  return error;
}

test('returns the defaults when the file does not exist', async () => {
  assert.deepEqual(await loadConfig(join(dir, 'missing.json')), DEFAULTS);
});

test('fields in the file override the defaults, the rest keep theirs', async () => {
  const path = await file('partial.json', '{ "port": 9090 }');
  assert.deepEqual(await loadConfig(path), { ...DEFAULTS, port: 9090 });
});

test('a file that sets every field replaces every default', async () => {
  const full = { host: 'db.internal', port: 5432, logLevel: 'debug' };
  const path = await file('full.json', JSON.stringify(full));
  assert.deepEqual(await loadConfig(path), full);
});

test('an empty JSON object gives the defaults', async () => {
  const path = await file('empty-object.json', '{}');
  assert.deepEqual(await loadConfig(path), DEFAULTS);
});

test('malformed JSON throws with the parse error as cause', async () => {
  const path = await file('broken.json', '{ "port": 9090,');
  const error = await loadError(path);
  assert.ok(error.cause instanceof SyntaxError, `cause is ${String(error.cause)}`);
});

test('a path that cannot be read throws with the read error as cause', async () => {
  // A directory exists but cannot be read as a file (EISDIR on every platform).
  const path = join(dir, 'a-directory.json');
  await mkdir(path);
  const error = await loadError(path);
  assert.equal((error.cause as { code?: unknown } | undefined)?.code, 'EISDIR');
});
