// Reads newline-delimited JSON from a file and POSTs each line to SINK_URL.
//
// Delivery is at-least-once. The checkpoint (a byte offset) only moves past an
// event after the sink answers 2xx, so a crash, deploy, or SIGTERM at any point
// re-sends at most the event that was in flight. Events the sink permanently
// rejects, and lines that are not JSON, go to a dead-letter file so they do not
// block the stream.
//
// Usage: SINK_URL=<url> node worker.mjs <events.ndjson>
// Optional env: CHECKPOINT_PATH, REQUEST_TIMEOUT_MS

import { createReadStream } from 'node:fs';
import { open, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const NEWLINE = 0x0a;

// Yields each line with the byte offset where it starts and where the next one starts.
// Works on raw bytes so offsets are exact and multi-byte UTF-8 split across chunks is safe.
export async function* readLines(file, start, chunkSize) {
  const stream = createReadStream(file, { start, highWaterMark: chunkSize });
  let pending = null;
  let pos = start;
  for await (const chunk of stream) {
    const buf = pending ? Buffer.concat([pending, chunk]) : chunk;
    let from = 0;
    let nl;
    while ((nl = buf.indexOf(NEWLINE, from)) !== -1) {
      const next = pos + (nl - from) + 1;
      yield { offset: pos, next, bytes: buf.subarray(from, nl) };
      pos = next;
      from = nl + 1;
    }
    pending = from < buf.length ? buf.subarray(from) : null;
  }
  if (pending) {
    yield { offset: pos, next: pos + pending.length, bytes: pending, unterminated: true };
  }
}

async function readCheckpoint(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
  const offset = Number(text.trim());
  // Refuse to guess: restarting from 0 would re-send the whole file.
  if (text.trim() === '' || !Number.isSafeInteger(offset) || offset < 0) {
    throw new Error(`corrupt checkpoint ${path}: ${JSON.stringify(text)}`);
  }
  return offset;
}

// Write to a temp file, fsync it, rename over the old one, then fsync the directory.
// A reader therefore sees either the old offset or the new one, never a partial write.
async function saveCheckpoint(path, offset) {
  const tmp = `${path}.tmp`;
  const fh = await open(tmp, 'w');
  try {
    await fh.writeFile(String(offset));
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, path);
  const dir = await open(dirname(path), 'r');
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}

async function appendDeadLetter(path, record) {
  const fh = await open(path, 'a');
  try {
    await fh.writeFile(`${JSON.stringify(record)}\n`);
    await fh.sync();
  } finally {
    await fh.close();
  }
}

// 5xx, 408 and 429 are transient, so keep retrying. Other 4xx mean the sink rejected
// this event itself, and retrying would never succeed.
const isTransient = (status) => status >= 500 || status === 408 || status === 429;

// Retries until the sink accepts the event or it is permanently rejected.
// Only an abort via opts.signal ends the loop without a result (it throws).
async function deliver(body, opts) {
  let delay = opts.backoffMs;
  for (let attempt = 1; ; attempt++) {
    let problem;
    try {
      const res = await fetch(opts.sinkUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.any([opts.signal, AbortSignal.timeout(opts.requestTimeoutMs)]),
      });
      await res.text(); // drain so the connection can be reused
      if (res.ok) return { ok: true };
      if (!isTransient(res.status)) return { ok: false, reason: `HTTP ${res.status}` };
      problem = `HTTP ${res.status}`;
    } catch (err) {
      if (opts.signal.aborted) throw err;
      problem = err.name === 'TimeoutError' ? `timed out after ${opts.requestTimeoutMs} ms` : err.message;
    }
    opts.log(`attempt ${attempt} failed (${problem}); retrying in ${delay} ms`);
    await sleep(delay, undefined, { signal: opts.signal });
    delay = Math.min(delay * 2, opts.maxBackoffMs);
  }
}

export async function run({
  file,
  sinkUrl,
  checkpointPath = `${file}.checkpoint`,
  deadLetterPath = `${checkpointPath}.deadletter`,
  requestTimeoutMs = 30_000,
  backoffMs = 1_000,
  maxBackoffMs = 30_000,
  chunkSize = 1 << 20,
  signal = new AbortController().signal,
  log = (msg) => console.error(`[worker] ${msg}`),
}) {
  const opts = { sinkUrl, requestTimeoutMs, backoffMs, maxBackoffMs, signal, log };
  const stats = { delivered: 0, deadLettered: 0 };
  let offset = await readCheckpoint(checkpointPath);
  try {
    for await (const line of readLines(file, offset, chunkSize)) {
      let text = line.bytes.toString('utf8');
      if (text.endsWith('\r')) text = text.slice(0, -1);
      if (text.trim() === '') {
        offset = line.next;
        continue;
      }

      let problem = null;
      try {
        JSON.parse(text);
      } catch {
        if (line.unterminated) {
          // The writer may still be appending this line. Leave it for a later run.
          log(`unterminated line at byte ${line.offset} is not complete JSON; leaving it`);
          break;
        }
        problem = 'invalid JSON';
      }
      if (problem === null) {
        const result = await deliver(text, opts);
        if (!result.ok) problem = result.reason;
      }

      if (problem === null) {
        stats.delivered++;
      } else {
        await appendDeadLetter(deadLetterPath, { offset: line.offset, reason: problem, line: text });
        stats.deadLettered++;
      }
      // Advance only after the event is delivered or safely dead-lettered.
      offset = line.next;
      await saveCheckpoint(checkpointPath, offset);
    }
    return { status: 'done', ...stats, offset };
  } catch (err) {
    if (signal.aborted) return { status: 'stopped', ...stats, offset };
    throw err;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file] = process.argv.slice(2);
  if (!file || !process.env.SINK_URL) {
    console.error('usage: SINK_URL=<url> node worker.mjs <events.ndjson>');
    process.exit(2);
  }
  const controller = new AbortController();
  for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => controller.abort());
  const result = await run({
    file,
    sinkUrl: process.env.SINK_URL,
    checkpointPath: process.env.CHECKPOINT_PATH,
    requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS ? Number(process.env.REQUEST_TIMEOUT_MS) : undefined,
    signal: controller.signal,
  });
  console.error(
    `[worker] ${result.status}: delivered=${result.delivered} deadLettered=${result.deadLettered} offset=${result.offset}`,
  );
}
