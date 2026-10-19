import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processRecords, type LedgerRecord, type RecordReader } from '../src/records.ts';

// A fake ledger database: counts opened and closed readers, and fails read() at `failReadAt`.
function ledger(records: LedgerRecord[], failReadAt = -1) {
  let opened = 0;
  let closed = 0;
  let reads = 0;
  const readFailure = new Error('connection reset');
  async function open(): Promise<RecordReader> {
    opened++;
    let next = 0;
    let isClosed = false;
    return {
      async read() {
        if (isClosed) throw new Error('read after close');
        if (reads++ === failReadAt) throw readFailure;
        return next < records.length ? records[next++] : null;
      },
      async close() {
        if (isClosed) throw new Error('closed twice');
        isClosed = true;
        closed++;
      },
    };
  }
  return { open, readFailure, stats: () => ({ opened, closed, reads }) };
}

const records: LedgerRecord[] = [
  { id: 'r1', amountCents: 100 },
  { id: 'r2', amountCents: -40 },
  { id: 'r3', amountCents: 250 },
];

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    value => assert.fail(`expected a rejection, got ${String(value)}`),
    (error: unknown) => error,
  );
}

test('handles every record in order and returns the count', async () => {
  const db = ledger(records);
  const seen: string[] = [];
  const count = await processRecords(db.open, async record => void seen.push(record.id));
  assert.equal(count, 3);
  assert.deepEqual(seen, ['r1', 'r2', 'r3']);
});

test('opens one reader and closes it after the last record', async () => {
  const db = ledger(records);
  await processRecords(db.open, async () => {});
  assert.deepEqual(db.stats(), { opened: 1, closed: 1, reads: 4 });
});

test('an empty ledger handles nothing and closes the reader', async () => {
  const db = ledger([]);
  let handled = 0;
  assert.equal(await processRecords(db.open, async () => void handled++), 0);
  assert.equal(handled, 0);
  assert.equal(db.stats().closed, 1);
});

test('rejects with the error handle throws', async () => {
  const db = ledger(records);
  const failure = new Error('bad record r2');
  const error = await rejection(
    processRecords(db.open, async record => {
      if (record.id === 'r2') throw failure;
    }),
  );
  assert.equal(error, failure);
});

test('closes the reader when handle throws midway', async () => {
  const db = ledger(records);
  const failure = new Error('bad record r2');
  const seen: string[] = [];
  const error = await rejection(
    processRecords(db.open, async record => {
      seen.push(record.id);
      if (record.id === 'r2') throw failure;
    }),
  );
  assert.equal(error, failure, 'the original error propagates');
  assert.deepEqual(seen, ['r1', 'r2'], 'stops at the failing record');
  assert.equal(db.stats().closed, 1, 'the reader was not closed');
});

test('closes the reader when read throws midway', async () => {
  const db = ledger(records, 1);
  const error = await rejection(processRecords(db.open, async () => {}));
  assert.equal(error, db.readFailure, 'the original error propagates');
  assert.equal(db.stats().closed, 1, 'the reader was not closed');
});
