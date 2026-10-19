import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeduper } from '../src/dedupe.ts';

function clock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: ms => void (t += ms) };
}

test('a redelivery inside the window is a duplicate', () => {
  const c = clock();
  const deduper = createDeduper({ windowMs: 1000, now: c.now });
  assert.equal(deduper.isDuplicate('m1'), false);
  c.advance(999);
  assert.equal(deduper.isDuplicate('m1'), true);
});

test('the same id after the window is new again', () => {
  const c = clock();
  const deduper = createDeduper({ windowMs: 1000, now: c.now });
  assert.equal(deduper.isDuplicate('m1'), false);
  c.advance(500);
  assert.equal(deduper.isDuplicate('m1'), true, 'duplicate inside the window');
  c.advance(501);
  assert.equal(deduper.isDuplicate('m1'), false, 'a duplicate does not refresh the record');
  c.advance(999);
  assert.equal(deduper.isDuplicate('m1'), true, 'recorded again at the last call');
});

test('ids are independent and size counts held ids', () => {
  const c = clock();
  const deduper = createDeduper({ windowMs: 1000, now: c.now });
  assert.equal(deduper.size, 0);
  assert.deepEqual(
    ['a', 'b', 'a', 'c', 'b'].map(id => deduper.isDuplicate(id)),
    [false, false, true, false, true],
  );
  assert.equal(deduper.size, 3);
});

test('defaults now to Date.now', () => {
  const deduper = createDeduper({ windowMs: 60_000 });
  assert.equal(deduper.isDuplicate('m1'), false);
  assert.equal(deduper.isDuplicate('m1'), true);
});

test('memory stays bounded as distinct ids keep arriving', () => {
  const c = clock();
  const deduper = createDeduper({ windowMs: 1000, now: c.now });
  // 100k distinct ids, one per millisecond: about 1000 are inside the window at any time.
  for (let i = 0; i < 100_000; i++) {
    deduper.isDuplicate(`id-${i}`);
    c.advance(1);
  }
  assert.ok(deduper.size <= 3000, `holds ${deduper.size} ids, about 1000 are inside the window`);
  c.advance(5000);
  deduper.isDuplicate('later');
  assert.ok(deduper.size <= 2000, `holds ${deduper.size} ids after every earlier id expired`);
});
