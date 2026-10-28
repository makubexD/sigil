// Streams a newline-delimited JSON file and POSTs each event to SINK_URL.
//
// Delivery is at-least-once: the checkpoint only moves past an event after the
// sink has answered 2xx (or the event was dead-lettered). A crash between the
// POST and the checkpoint write re-sends that one event on the next run; the
// Idempotency-Key header lets the sink drop the duplicate.
//
// CHECKPOINT_PATH and DEAD_LETTER_PATH must live on storage that survives a
// container replacement, next to the input file on a mounted volume.

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const NEWLINE = 0x0a;
const CARRIAGE_RETURN = 0x0d;

export async function run({
  file,
  sinkUrl,
  checkpointPath = `${file}.checkpoint.json`,
  deadLetterPath = `${file}.dead-letter.ndjson`,
  signal = new AbortController().signal,
  chunkSize = 1 << 20,
  requestTimeoutMs = 30_000,
  retryBaseMs = 500,
  retryMaxMs = 30_000,
  fetchImpl = globalThis.fetch,
  log = () => {},
}) {
  const inputPath = path.resolve(file);
  let offset = await loadCheckpoint(checkpointPath, inputPath);

  const handle = await fs.open(inputPath, 'r');
  try {
    const { size } = await handle.stat();
    if (offset > size) {
      throw new Error(`checkpoint offset ${offset} is past the end of ${inputPath} (${size} bytes)`);
    }

    for await (const { line, start, next } of readLines(handle, offset, chunkSize)) {
      const text = stripCarriageReturn(line).toString('utf8');

      if (text.trim() !== '') {
        if (!isJson(text)) {
          await appendDeadLetter(deadLetterPath, { offset: start, reason: 'invalid-json', line: text });
        } else {
          const key = createHash('sha256').update(`${inputPath}\0${start}`).digest('hex');
          const outcome = await deliver({
            body: stripCarriageReturn(line),
            key,
            sinkUrl,
            signal,
            fetchImpl,
            requestTimeoutMs,
            retryBaseMs,
            retryMaxMs,
            log,
          });
          if (outcome === 'stopped') return { status: 'stopped', offset };
          if (outcome === 'rejected') {
            await appendDeadLetter(deadLetterPath, { offset: start, reason: 'rejected-by-sink', line: text });
          }
        }
      }

      offset = next;
      await saveCheckpoint(checkpointPath, inputPath, offset);
    }
  } finally {
    await handle.close();
  }

  return { status: 'done', offset };
}

// Yields complete lines with their byte offsets. Reads in fixed-size chunks so
// memory stays bounded for multi-gigabyte files. A final line without a
// trailing newline is yielded too.
async function* readLines(handle, startOffset, chunkSize) {
  let readPos = startOffset;
  let pending = Buffer.alloc(0);
  let pendingStart = startOffset;
  const buf = Buffer.allocUnsafe(chunkSize);

  for (;;) {
    const { bytesRead } = await handle.read(buf, 0, chunkSize, readPos);
    if (bytesRead === 0) break;
    readPos += bytesRead;

    pending = Buffer.concat([pending, buf.subarray(0, bytesRead)]);
    let from = 0;
    let nl;
    while ((nl = pending.indexOf(NEWLINE, from)) !== -1) {
      yield {
        line: pending.subarray(from, nl),
        start: pendingStart + from,
        next: pendingStart + nl + 1,
      };
      from = nl + 1;
    }
    pending = pending.subarray(from);
    pendingStart += from;
  }

  if (pending.length > 0) {
    yield {
      line: pending,
      start: pendingStart,
      next: pendingStart + pending.length,
    };
  }
}

function isJson(text) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function stripCarriageReturn(line) {
  return line.length > 0 && line[line.length - 1] === CARRIAGE_RETURN ? line.subarray(0, -1) : line;
}

// Returns 'delivered', 'rejected' (permanent 4xx), or 'stopped'. Transient
// failures (network errors, timeouts, 429, 5xx) are retried until the event
// is accepted or the signal aborts, so an event is never skipped.
async function deliver({ body, key, sinkUrl, signal, fetchImpl, requestTimeoutMs, retryBaseMs, retryMaxMs, log }) {
  for (let attempt = 0; ; attempt++) {
    if (signal.aborted) return 'stopped';

    let reason;
    try {
      const res = await fetchImpl(sinkUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]),
      });
      await res.arrayBuffer();
      if (res.ok) return 'delivered';
      if (res.status < 500 && res.status !== 429) return 'rejected';
      reason = `HTTP ${res.status}`;
    } catch (err) {
      if (signal.aborted) return 'stopped';
      reason = err.name === 'TimeoutError' ? 'timeout' : err.message;
    }

    const delay = Math.min(retryMaxMs, retryBaseMs * 2 ** Math.min(attempt, 30));
    log(`sink request failed (${reason}); retrying in ${delay} ms`);
    await sleep(delay, signal);
  }
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    }
    signal.addEventListener('abort', finish, { once: true });
  });
}

async function loadCheckpoint(checkpointPath, inputPath) {
  let text;
  try {
    text = await fs.readFile(checkpointPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
  const { file, offset } = JSON.parse(text);
  if (file !== inputPath) {
    throw new Error(`checkpoint ${checkpointPath} belongs to ${file}, not ${inputPath}`);
  }
  return offset;
}

async function saveCheckpoint(checkpointPath, inputPath, offset) {
  await writeFileDurably(checkpointPath, `${JSON.stringify({ file: inputPath, offset })}\n`);
}

// Write to a temp file, fsync it, rename over the target, then fsync the
// directory so the rename itself survives a crash.
async function writeFileDurably(target, data) {
  const tmp = `${target}.tmp`;
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, target);

  const dir = await fs.open(path.dirname(path.resolve(target)), 'r');
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}

async function appendDeadLetter(deadLetterPath, record) {
  const handle = await fs.open(deadLetterPath, 'a');
  try {
    await handle.writeFile(`${JSON.stringify(record)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const file = process.argv[2];
  const sinkUrl = process.env.SINK_URL;
  if (!file || !sinkUrl) {
    console.error('usage: SINK_URL=<url> node worker.mjs <events.ndjson>');
    console.error('optional env: CHECKPOINT_PATH, DEAD_LETTER_PATH, REQUEST_TIMEOUT_MS');
    process.exit(2);
  }

  const controller = new AbortController();
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.once(sig, () => {
      console.error(`${sig}: finishing the in-flight event and exiting`);
      controller.abort();
    });
  }

  try {
    const result = await run({
      file,
      sinkUrl,
      checkpointPath: process.env.CHECKPOINT_PATH,
      deadLetterPath: process.env.DEAD_LETTER_PATH,
      requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS ? Number(process.env.REQUEST_TIMEOUT_MS) : undefined,
      signal: controller.signal,
      log: (msg) => console.error(msg),
    });
    console.error(JSON.stringify(result));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
