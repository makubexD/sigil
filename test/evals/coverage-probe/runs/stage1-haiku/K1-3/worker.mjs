#!/usr/bin/env node
// Streams newline-delimited JSON from a file and POSTs each event to SINK_URL.
//
// Delivery is at-least-once. The byte offset just past an event is saved to the
// checkpoint file only after the sink has accepted that event, so a crash, a
// SIGTERM, or a container replacement replays at most the event in flight. Each
// POST carries an Idempotency-Key built from the file identity and byte offset,
// so the sink can drop replays. The checkpoint must live on storage that
// survives the container (STATE_FILE on a mounted volume).

import { createReadStream } from 'node:fs';
import { appendFile, mkdir, open, readFile, rename, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const LF = 0x0a;

const isRetryableStatus = (status) => status >= 500 || status === 408 || status === 425 || status === 429;

export async function run({
  file,
  sinkUrl,
  statePath = `${file}.checkpoint.json`,
  rejectsPath = `${statePath}.rejects.ndjson`,
  requestTimeoutMs = 10_000,
  retryBaseMs = 500,
  retryMaxMs = 30_000,
  signal,
  log = (msg) => process.stderr.write(`${msg}\n`),
}) {
  const st = await stat(file);
  const id = { file, dev: st.dev, ino: st.ino };
  await mkdir(dirname(statePath), { recursive: true });

  let offset = await loadOffset(statePath, id, st.size);
  let delivered = 0;
  let rejected = 0;

  const checkpoint = async (end) => {
    offset = end;
    await saveState(statePath, { ...id, offset });
  };

  const post = async (event, start) => {
    const body = JSON.stringify(event);
    const headers = {
      'content-type': 'application/json',
      'idempotency-key': `${id.dev}:${id.ino}:${start}`,
    };
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) return false;
      const timeout = AbortSignal.timeout(requestTimeoutMs);
      let status;
      let reason;
      try {
        const res = await fetch(sinkUrl, {
          method: 'POST',
          headers,
          body,
          signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
        });
        await res.body?.cancel().catch(() => {});
        status = res.status;
      } catch (err) {
        if (signal?.aborted) return false;
        reason = err.name === 'TimeoutError' ? 'timed out' : (err.cause?.code ?? err.message);
      }
      if (status >= 200 && status < 300) return true;
      if (status !== undefined && !isRetryableStatus(status)) {
        throw new Error(`sink rejected offset ${start} with HTTP ${status}; fix the sink or the input and rerun`);
      }
      reason ??= `HTTP ${status}`;
      const delay = Math.min(retryMaxMs, retryBaseMs * 2 ** Math.min(attempt, 30));
      log(`offset ${start}: ${reason}; retry ${attempt + 1} in ${delay}ms`);
      if (!(await sleep(delay, signal))) return false;
    }
  };

  // Returns false if the run was stopped before this line was settled.
  const deliver = async (line, start, end) => {
    if (signal?.aborted) return false;
    const text = line.toString('utf8').replace(/\r$/, '');
    if (text.trim() === '') {
      await checkpoint(end);
      return true;
    }
    let event;
    try {
      event = JSON.parse(text);
    } catch (err) {
      // Not valid JSON, so the sink cannot take it. Keep the raw line for review.
      await appendFile(rejectsPath, `${JSON.stringify({ offset: start, error: err.message, raw: text })}\n`);
      rejected++;
      await checkpoint(end);
      return true;
    }
    if (!(await post(event, start))) return false;
    delivered++;
    await checkpoint(end);
    return true;
  };

  // Lines are split on raw bytes so offsets stay exact. Only the unfinished
  // tail of each chunk is carried over, so memory stays bounded by the longest line.
  let stopped = false;
  let pending = Buffer.alloc(0);
  let pendingStart = offset;
  scan: for await (const chunk of createReadStream(file, { start: offset })) {
    const buf = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    let from = 0;
    let nl;
    while ((nl = buf.indexOf(LF, from)) !== -1) {
      if (!(await deliver(buf.subarray(from, nl), pendingStart + from, pendingStart + nl + 1))) {
        stopped = true;
        break scan;
      }
      from = nl + 1;
    }
    pending = Buffer.from(buf.subarray(from));
    pendingStart += from;
  }
  // A final line with no trailing newline is still an event.
  if (!stopped && pending.length) {
    stopped = !(await deliver(pending, pendingStart, pendingStart + pending.length));
  }

  return { offset, delivered, rejected, stopped };
}

async function loadOffset(statePath, id, size) {
  let raw;
  try {
    raw = await readFile(statePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
  // A corrupt checkpoint is fatal. Restarting from 0 would replay the whole file.
  const saved = JSON.parse(raw);
  if (saved.dev !== id.dev || saved.ino !== id.ino) {
    throw new Error(`checkpoint ${statePath} was written for a different file than ${id.file}`);
  }
  if (saved.offset > size) {
    throw new Error(`checkpoint offset ${saved.offset} is past the end of ${id.file} (${size} bytes)`);
  }
  return saved.offset;
}

// Write-then-rename, so a crash leaves either the old or the new checkpoint.
async function saveState(statePath, state) {
  const tmp = `${statePath}.tmp`;
  const fh = await open(tmp, 'w');
  try {
    await fh.writeFile(`${JSON.stringify(state)}\n`);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, statePath);
}

// Resolves true when the delay elapsed, false when the signal aborted first.
function sleep(ms, signal) {
  return new Promise((resolveSleep) => {
    if (signal?.aborted) return resolveSleep(false);
    const onAbort = () => {
      clearTimeout(timer);
      resolveSleep(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolveSleep(true);
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function main(argv, env) {
  const [input] = argv;
  if (!input || !env.SINK_URL) {
    process.stderr.write('usage: SINK_URL=<url> [STATE_FILE=<path>] node worker.mjs <events.ndjson>\n');
    return 2;
  }

  const controller = new AbortController();
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.once(sig, () => {
      process.stderr.write(`${sig}: stopping; the checkpoint has the resume point\n`);
      controller.abort();
    });
  }

  const result = await run({
    file: resolve(input),
    sinkUrl: env.SINK_URL,
    statePath: env.STATE_FILE,
    signal: controller.signal,
  });
  process.stderr.write(
    `delivered=${result.delivered} rejected=${result.rejected} offset=${result.offset}` +
      (result.stopped ? ' (stopped early; resumes from checkpoint)' : '') +
      '\n',
  );
  return 0;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  main(process.argv.slice(2), process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`${err.message}\n`);
      process.exitCode = 1;
    },
  );
}
