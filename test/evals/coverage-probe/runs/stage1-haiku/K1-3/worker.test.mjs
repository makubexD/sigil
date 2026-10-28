import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { run } from './worker.mjs';

const execFileAsync = promisify(execFile);

async function withDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'worker-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Sink that records the events it accepts. `respond(n, event)` picks the outcome
// for the nth request: an HTTP status, or 'hang' to never answer.
async function startSink(respond = () => 200) {
  const accepted = [];
  let count = 0;
  const server = createServer((req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => {
      const n = ++count;
      const event = JSON.parse(raw);
      const status = respond(n, event);
      if (status === 'hang') return;
      if (status >= 200 && status < 300) accepted.push(event);
      res.writeHead(status).end();
    });
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    accepted,
    requests: () => count,
    close: () =>
      new Promise((resolveClose) => {
        server.closeAllConnections();
        server.close(resolveClose);
      }),
  };
}

const ndjson = (events) => events.map((e) => `${JSON.stringify(e)}\n`).join('');
const events = (n) => Array.from({ length: n }, (_, i) => ({ i }));

test('delivers every event in order and checkpoints the end of the file', () =>
  withDir(async (dir) => {
    const file = join(dir, 'events.ndjson');
    const all = events(1000);
    await writeFile(file, ndjson(all));
    const sink = await startSink();
    try {
      const result = await run({ file, sinkUrl: sink.url, statePath: join(dir, 'state.json') });
      assert.deepEqual(sink.accepted, all);
      assert.equal(result.delivered, 1000);
      assert.equal(result.stopped, false);
      assert.equal(result.offset, (await stat(file)).size);
    } finally {
      await sink.close();
    }
  }));

test('a stopped run resumes from the last acknowledged event without losing any', () =>
  withDir(async (dir) => {
    const file = join(dir, 'events.ndjson');
    const statePath = join(dir, 'state.json');
    await writeFile(file, ndjson(events(500)));

    const controller = new AbortController();
    const first = await startSink((n) => {
      if (n === 300) controller.abort();
      return 200;
    });
    let firstRun;
    try {
      firstRun = await run({ file, sinkUrl: first.url, statePath, signal: controller.signal });
    } finally {
      await first.close();
    }
    assert.equal(firstRun.stopped, true);

    const second = await startSink();
    try {
      await run({ file, sinkUrl: second.url, statePath });
    } finally {
      await second.close();
    }

    // The event in flight at the stop may be replayed, but nothing is skipped.
    const resumedAt = second.accepted[0].i;
    assert.ok(resumedAt === 299 || resumedAt === 300, `resumed at event ${resumedAt}`);
    const seen = new Set([...first.accepted, ...second.accepted].map((e) => e.i));
    assert.equal(seen.size, 500);
  }));

test('retries server errors until the sink recovers', () =>
  withDir(async (dir) => {
    const file = join(dir, 'events.ndjson');
    const all = events(20);
    await writeFile(file, ndjson(all));
    const attempts = new Map();
    const sink = await startSink((_, e) => {
      const t = (attempts.get(e.i) ?? 0) + 1;
      attempts.set(e.i, t);
      return t <= 2 ? 503 : 200;
    });
    try {
      const result = await run({
        file,
        sinkUrl: sink.url,
        statePath: join(dir, 'state.json'),
        retryBaseMs: 1,
        retryMaxMs: 5,
      });
      assert.deepEqual(sink.accepted, all);
      assert.equal(result.delivered, 20);
      assert.equal(sink.requests(), 60);
    } finally {
      await sink.close();
    }
  }));

test('a sink that stops answering is timed out and retried', () =>
  withDir(async (dir) => {
    const file = join(dir, 'events.ndjson');
    const all = events(5);
    await writeFile(file, ndjson(all));
    const sink = await startSink((n) => (n === 1 ? 'hang' : 200));
    try {
      await run({
        file,
        sinkUrl: sink.url,
        statePath: join(dir, 'state.json'),
        requestTimeoutMs: 100,
        retryBaseMs: 1,
      });
      assert.deepEqual(sink.accepted, all);
    } finally {
      await sink.close();
    }
  }));

test('a permanent 4xx stops the run without checkpointing the rejected event', () =>
  withDir(async (dir) => {
    const file = join(dir, 'events.ndjson');
    const statePath = join(dir, 'state.json');
    const all = events(10);
    await writeFile(file, ndjson(all));
    const sink = await startSink((_, e) => (e.i === 5 ? 400 : 200));
    try {
      await assert.rejects(run({ file, sinkUrl: sink.url, statePath }), /HTTP 400/);
    } finally {
      await sink.close();
    }
    const saved = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(saved.offset, Buffer.byteLength(ndjson(all.slice(0, 5))));
  }));

test('malformed lines are quarantined to the rejects file and blank lines skipped', () =>
  withDir(async (dir) => {
    const file = join(dir, 'events.ndjson');
    const statePath = join(dir, 'state.json');
    await writeFile(file, '{"a":1}\nnot json\n\n{"a":2}\r\n');
    const sink = await startSink();
    try {
      const result = await run({ file, sinkUrl: sink.url, statePath });
      assert.deepEqual(sink.accepted, [{ a: 1 }, { a: 2 }]);
      assert.equal(result.rejected, 1);
    } finally {
      await sink.close();
    }
    const rejects = (await readFile(`${statePath}.rejects.ndjson`, 'utf8')).trim().split('\n');
    assert.equal(rejects.length, 1);
    assert.equal(JSON.parse(rejects[0]).raw, 'not json');
  }));

test('lines longer than a read chunk and a final line without newline are delivered', () =>
  withDir(async (dir) => {
    const file = join(dir, 'events.ndjson');
    const big = { i: 1, payload: 'x'.repeat(200_000) };
    await writeFile(file, `${ndjson([{ i: 0 }, big])}${JSON.stringify({ i: 2 })}`);
    const sink = await startSink();
    try {
      await run({ file, sinkUrl: sink.url, statePath: join(dir, 'state.json') });
      assert.deepEqual(sink.accepted, [{ i: 0 }, big, { i: 2 }]);
    } finally {
      await sink.close();
    }
  }));

test('refuses to resume from a checkpoint that belongs to a different file', () =>
  withDir(async (dir) => {
    const file = join(dir, 'events.ndjson');
    const statePath = join(dir, 'state.json');
    await writeFile(file, ndjson(events(3)));
    await writeFile(statePath, JSON.stringify({ file, dev: 0, ino: 0, offset: 0 }));
    const sink = await startSink();
    try {
      await assert.rejects(run({ file, sinkUrl: sink.url, statePath }), /different file/);
      assert.equal(sink.requests(), 0);
    } finally {
      await sink.close();
    }
  }));

test('refuses to resume from a checkpoint past the end of a truncated file', () =>
  withDir(async (dir) => {
    const file = join(dir, 'events.ndjson');
    const statePath = join(dir, 'state.json');
    await writeFile(file, ndjson(events(3)));
    const { dev, ino } = await stat(file);
    await writeFile(statePath, JSON.stringify({ file, dev, ino, offset: 1_000_000 }));
    const sink = await startSink();
    try {
      await assert.rejects(run({ file, sinkUrl: sink.url, statePath }), /past the end/);
    } finally {
      await sink.close();
    }
  }));

test('the CLI exits 2 with usage when arguments are missing', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ['worker.mjs'], { env: { PATH: process.env.PATH }, cwd: import.meta.dirname }),
    (err) => err.code === 2 && /usage:/.test(err.stderr),
  );
});
