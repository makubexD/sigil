import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, readFile, stat, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { run } from './worker.mjs';

const quiet = { log: () => {} };
const ev = (id) => JSON.stringify({ id });

async function setup(content) {
  const dir = await mkdtemp(join(tmpdir(), 'worker-test-'));
  const file = join(dir, 'events.ndjson');
  const checkpoint = join(dir, 'checkpoint');
  await writeFile(file, content);
  return { file, checkpoint, deadLetter: `${checkpoint}.deadletter` };
}

// script(requestNumber, body) returns an HTTP status, or 'hang' to never answer.
async function startSink(script) {
  const accepted = [];
  let requests = 0;
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const action = await script(++requests, body);
    if (action === 'hang') return;
    if (action >= 200 && action < 300) accepted.push(body);
    res.writeHead(action).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    accepted,
    get requests() {
      return requests;
    },
    close() {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

async function withSink(script, fn) {
  const sink = await startSink(script);
  try {
    return await fn(sink);
  } finally {
    await sink.close();
  }
}

const ids = (sink) => sink.accepted.map((b) => JSON.parse(b).id);
const ok = () => 200;

test('delivers every event in order and checkpoints the end of the file', async () => {
  const t = await setup([ev(0), ev(1), ev(2)].map((l) => `${l}\n`).join(''));
  await withSink(ok, async (sink) => {
    const result = await run({ file: t.file, sinkUrl: sink.url, checkpointPath: t.checkpoint, ...quiet });
    assert.equal(result.status, 'done');
    assert.equal(result.delivered, 3);
    assert.deepEqual(ids(sink), [0, 1, 2]);
    assert.equal(await readFile(t.checkpoint, 'utf8'), String((await stat(t.file)).size));
  });
});

test('resumes after the checkpoint without re-sending earlier events', async () => {
  const lines = [0, 1, 2, 3].map((i) => `${ev(i)}\n`);
  const t = await setup(lines.join(''));
  await writeFile(t.checkpoint, String(Buffer.byteLength(lines[0] + lines[1])));
  await withSink(ok, async (sink) => {
    await run({ file: t.file, sinkUrl: sink.url, checkpointPath: t.checkpoint, ...quiet });
    assert.deepEqual(ids(sink), [2, 3]);
  });
});

test('retries 5xx responses and does not skip or reorder the failed event', async () => {
  const t = await setup([0, 1, 2].map((i) => `${ev(i)}\n`).join(''));
  // Request 2 (event 1) gets 503, request 3 gets 500, request 4 succeeds.
  const script = (n) => (n === 2 ? 503 : n === 3 ? 500 : 200);
  await withSink(script, async (sink) => {
    await run({ file: t.file, sinkUrl: sink.url, checkpointPath: t.checkpoint, backoffMs: 1, maxBackoffMs: 5, ...quiet });
    assert.deepEqual(ids(sink), [0, 1, 2]);
    assert.equal(sink.requests, 5);
  });
});

test('a hung endpoint times out and the event is retried', async () => {
  const t = await setup([0, 1].map((i) => `${ev(i)}\n`).join(''));
  const script = (n) => (n === 1 ? 'hang' : 200);
  await withSink(script, async (sink) => {
    await run({
      file: t.file,
      sinkUrl: sink.url,
      checkpointPath: t.checkpoint,
      requestTimeoutMs: 100,
      backoffMs: 1,
      ...quiet,
    });
    assert.deepEqual(ids(sink), [0, 1]);
    assert.equal(sink.requests, 3);
  });
});

test('a permanently rejected event (4xx) goes to the dead letter and does not block the stream', async () => {
  const lines = [0, 1, 2].map((i) => `${ev(i)}\n`);
  const t = await setup(lines.join(''));
  const script = (n, body) => (body.includes('"id":1') ? 400 : 200);
  await withSink(script, async (sink) => {
    const result = await run({ file: t.file, sinkUrl: sink.url, checkpointPath: t.checkpoint, ...quiet });
    assert.equal(result.deadLettered, 1);
    assert.deepEqual(ids(sink), [0, 2]);
    const [record] = (await readFile(t.deadLetter, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(record.offset, Buffer.byteLength(lines[0]));
    assert.equal(record.reason, 'HTTP 400');
    assert.equal(record.line, ev(1));
  });
});

test('a line that is not JSON goes to the dead letter', async () => {
  const t = await setup(`${ev(0)}\nnot json\n${ev(2)}\n`);
  await withSink(ok, async (sink) => {
    const result = await run({ file: t.file, sinkUrl: sink.url, checkpointPath: t.checkpoint, ...quiet });
    assert.equal(result.deadLettered, 1);
    assert.deepEqual(ids(sink), [0, 2]);
    const [record] = (await readFile(t.deadLetter, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(record.reason, 'invalid JSON');
  });
});

test('handles CRLF, blank lines, multi-byte UTF-8 split across chunks, and a final line without newline', async () => {
  const t = await setup('{"s":"héllo"}\r\n\n{"s":"日本語"}\n{"s":"x"}');
  await withSink(ok, async (sink) => {
    await run({ file: t.file, sinkUrl: sink.url, checkpointPath: t.checkpoint, chunkSize: 2, ...quiet });
    assert.deepEqual(sink.accepted.map((b) => JSON.parse(b).s), ['héllo', '日本語', 'x']);
    assert.equal(await readFile(t.checkpoint, 'utf8'), String((await stat(t.file)).size));
  });
});

test('an incomplete trailing line is left for a later run, then delivered once complete', async () => {
  const first = `${ev(0)}\n`;
  const t = await setup(`${first}{"id":`);
  await withSink(ok, async (sink) => {
    const r1 = await run({ file: t.file, sinkUrl: sink.url, checkpointPath: t.checkpoint, ...quiet });
    assert.equal(r1.status, 'done');
    assert.deepEqual(ids(sink), [0]);
    assert.equal(await readFile(t.checkpoint, 'utf8'), String(Buffer.byteLength(first)));

    await appendFile(t.file, '1}\n');
    await run({ file: t.file, sinkUrl: sink.url, checkpointPath: t.checkpoint, ...quiet });
    assert.deepEqual(ids(sink), [0, 1]);
  });
});

test('stopping during an outage keeps the unacknowledged event; a later run delivers it exactly once', async () => {
  const t = await setup([0, 1, 2].map((i) => `${ev(i)}\n`).join(''));
  let healthy = false;
  const script = (n, body) => (healthy || !body.includes('"id":1') ? 200 : 503);
  await withSink(script, async (sink) => {
    const controller = new AbortController();
    const running = run({
      file: t.file,
      sinkUrl: sink.url,
      checkpointPath: t.checkpoint,
      backoffMs: 5,
      maxBackoffMs: 5,
      signal: controller.signal,
      ...quiet,
    });
    while (sink.requests < 3) await sleep(5);
    controller.abort();
    const stopped = await running;
    assert.equal(stopped.status, 'stopped');
    assert.deepEqual(ids(sink), [0]);
    assert.equal(await readFile(t.checkpoint, 'utf8'), String(Buffer.byteLength(`${ev(0)}\n`)));

    healthy = true;
    await run({ file: t.file, sinkUrl: sink.url, checkpointPath: t.checkpoint, ...quiet });
    assert.deepEqual(ids(sink), [0, 1, 2]);
  });
});

test('a corrupt checkpoint is an error rather than a silent restart from the beginning', async () => {
  const t = await setup(`${ev(0)}\n`);
  await writeFile(t.checkpoint, 'abc');
  await withSink(ok, async (sink) => {
    await assert.rejects(
      run({ file: t.file, sinkUrl: sink.url, checkpointPath: t.checkpoint, ...quiet }),
      /corrupt checkpoint/,
    );
    assert.equal(sink.requests, 0);
  });
});
