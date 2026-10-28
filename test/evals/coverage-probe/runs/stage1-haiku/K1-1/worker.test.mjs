import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { run } from './worker.mjs';

async function tmpDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'worker-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

async function writeInput(dir, content) {
  const file = path.join(dir, 'events.ndjson');
  await fs.writeFile(file, content);
  return file;
}

const ndjson = (objs) => objs.map((o) => `${JSON.stringify(o)}\n`).join('');

// decide(body, nth) returns an HTTP status, or 'hang' to leave the request
// unanswered. nth counts earlier requests that carried the same body.
async function startSink(decide = () => 200) {
  const accepted = [];
  const requests = [];
  const seen = new Map();
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString('utf8');
    const nth = seen.get(body) ?? 0;
    seen.set(body, nth + 1);
    requests.push({ body, key: req.headers['idempotency-key'], nth });

    const status = await decide(body, nth);
    if (status === 'hang') return;
    res.statusCode = status;
    res.end();
    if (status >= 200 && status < 300) accepted.push(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    accepted,
    requests,
    close: () => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

const fast = { retryBaseMs: 1, retryMaxMs: 5 };

test('delivers every event in order and checkpoints the end of the file', async (t) => {
  const dir = await tmpDir(t);
  const file = await writeInput(dir, ndjson([{ a: 1 }, { b: 2 }, { c: 3 }]));
  const sink = await startSink();
  t.after(() => sink.close());

  const result = await run({ file, sinkUrl: sink.url, ...fast });

  assert.equal(result.status, 'done');
  assert.deepEqual(sink.accepted.map((b) => JSON.parse(b)), [{ a: 1 }, { b: 2 }, { c: 3 }]);
  const checkpoint = JSON.parse(await fs.readFile(`${file}.checkpoint.json`, 'utf8'));
  assert.equal(checkpoint.offset, (await fs.stat(file)).size);
});

test('a restart resumes after the last confirmed event and does not re-send it', async (t) => {
  const dir = await tmpDir(t);
  const file = await writeInput(dir, ndjson([{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5 }]));

  // First run: the sink goes away while event 3 is in flight.
  const controller = new AbortController();
  const first = await startSink((body) => {
    if (body === '{"n":3}') {
      controller.abort();
      return 'hang';
    }
    return 200;
  });
  t.after(() => first.close());
  const r1 = await run({ file, sinkUrl: first.url, signal: controller.signal, ...fast });
  assert.equal(r1.status, 'stopped');
  assert.deepEqual(first.accepted.map((b) => JSON.parse(b).n), [1, 2]);

  // Second run (a fresh container) picks up at event 3.
  const second = await startSink();
  t.after(() => second.close());
  const r2 = await run({ file, sinkUrl: second.url, ...fast });
  assert.equal(r2.status, 'done');
  assert.deepEqual(second.accepted.map((b) => JSON.parse(b).n), [3, 4, 5]);
});

test('transient 5xx responses are retried with the same key and never skip the event', async (t) => {
  const dir = await tmpDir(t);
  const file = await writeInput(dir, ndjson([{ id: 1 }, { id: 2 }, { id: 3 }]));
  const sink = await startSink((body, nth) => (body === '{"id":2}' && nth < 2 ? 503 : 200));
  t.after(() => sink.close());

  const result = await run({ file, sinkUrl: sink.url, ...fast });

  assert.equal(result.status, 'done');
  assert.deepEqual(sink.accepted.map((b) => JSON.parse(b).id), [1, 2, 3]);
  const attempts = sink.requests.filter((r) => r.body === '{"id":2}');
  assert.equal(attempts.length, 3);
  assert.equal(new Set(attempts.map((r) => r.key)).size, 1, 'retries reuse one idempotency key');
  assert.notEqual(attempts[0].key, sink.requests.find((r) => r.body === '{"id":1}').key);
});

test('a hung endpoint times out and the event is retried', async (t) => {
  const dir = await tmpDir(t);
  const file = await writeInput(dir, ndjson([{ slow: true }]));
  const sink = await startSink((_body, nth) => (nth === 0 ? 'hang' : 200));
  t.after(() => sink.close());

  const result = await run({ file, sinkUrl: sink.url, requestTimeoutMs: 100, ...fast });

  assert.equal(result.status, 'done');
  assert.equal(sink.accepted.length, 1);
});

test('the checkpoint never moves past an event the sink has not accepted', async (t) => {
  const dir = await tmpDir(t);
  const first = '{"n":1}\n';
  const file = await writeInput(dir, first + ndjson([{ n: 2 }]));
  const sink = await startSink((body) => (body === '{"n":2}' ? 500 : 200));
  t.after(() => sink.close());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 200);
  t.after(() => clearTimeout(timer));

  const result = await run({ file, sinkUrl: sink.url, signal: controller.signal, retryBaseMs: 10, retryMaxMs: 20 });

  assert.equal(result.status, 'stopped');
  assert.equal(result.offset, Buffer.byteLength(first));
  const checkpoint = JSON.parse(await fs.readFile(`${file}.checkpoint.json`, 'utf8'));
  assert.equal(checkpoint.offset, Buffer.byteLength(first));
});

test('a permanent 4xx rejection is dead-lettered and the run continues', async (t) => {
  const dir = await tmpDir(t);
  const file = await writeInput(dir, ndjson([{ n: 1 }, { n: 2 }, { n: 3 }]));
  const sink = await startSink((body) => (body === '{"n":2}' ? 400 : 200));
  t.after(() => sink.close());

  const result = await run({ file, sinkUrl: sink.url, ...fast });

  assert.equal(result.status, 'done');
  assert.deepEqual(sink.accepted.map((b) => JSON.parse(b).n), [1, 3]);
  const deadLetters = (await fs.readFile(`${file}.dead-letter.ndjson`, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(deadLetters.length, 1);
  assert.equal(deadLetters[0].reason, 'rejected-by-sink');
  assert.equal(deadLetters[0].offset, Buffer.byteLength(ndjson([{ n: 1 }])));
});

test('invalid JSON is dead-lettered and blank lines are skipped', async (t) => {
  const dir = await tmpDir(t);
  const file = await writeInput(dir, '{"a":1}\n\nnot json\n   \n{"b":2}\n');
  const sink = await startSink();
  t.after(() => sink.close());

  const result = await run({ file, sinkUrl: sink.url, ...fast });

  assert.equal(result.status, 'done');
  assert.deepEqual(sink.accepted.map((b) => JSON.parse(b)), [{ a: 1 }, { b: 2 }]);
  const deadLetters = (await fs.readFile(`${file}.dead-letter.ndjson`, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(deadLetters.map((d) => d.reason), ['invalid-json']);
  assert.equal(deadLetters[0].line, 'not json');
});

test('lines spanning tiny read chunks, CRLF endings and a missing final newline all parse', async (t) => {
  const dir = await tmpDir(t);
  const file = await writeInput(dir, '{"n":1}\r\n{"n":22}\n{"n":333}');
  const sink = await startSink();
  t.after(() => sink.close());

  const result = await run({ file, sinkUrl: sink.url, chunkSize: 3, ...fast });

  assert.equal(result.status, 'done');
  assert.deepEqual(sink.accepted.map((b) => JSON.parse(b).n), [1, 22, 333]);
});

test('a large file streams through without losing or duplicating events', async (t) => {
  const dir = await tmpDir(t);
  const count = 5000;
  const objs = Array.from({ length: count }, (_, i) => ({ i, pad: 'x'.repeat(i % 200) }));
  const file = await writeInput(dir, ndjson(objs));
  const sink = await startSink();
  t.after(() => sink.close());

  const result = await run({ file, sinkUrl: sink.url, chunkSize: 4096, ...fast });

  assert.equal(result.status, 'done');
  assert.deepEqual(sink.accepted.map((b) => JSON.parse(b).i), objs.map((o) => o.i));
});

test('a checkpoint belonging to a different file is refused', async (t) => {
  const dir = await tmpDir(t);
  const file = await writeInput(dir, ndjson([{ n: 1 }]));
  await fs.writeFile(`${file}.checkpoint.json`, JSON.stringify({ file: '/somewhere/else.ndjson', offset: 0 }));
  const sink = await startSink();
  t.after(() => sink.close());

  await assert.rejects(run({ file, sinkUrl: sink.url, ...fast }), /belongs to \/somewhere\/else\.ndjson/);
  assert.equal(sink.requests.length, 0);
});

test('a checkpoint past the end of the file is refused', async (t) => {
  const dir = await tmpDir(t);
  const file = await writeInput(dir, ndjson([{ n: 1 }]));
  await fs.writeFile(`${file}.checkpoint.json`, JSON.stringify({ file, offset: 10_000 }));
  const sink = await startSink();
  t.after(() => sink.close());

  await assert.rejects(run({ file, sinkUrl: sink.url, ...fast }), /past the end/);
});
