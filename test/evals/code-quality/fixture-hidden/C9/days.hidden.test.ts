import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countByDay } from '../src/days.ts';

/** UTC instant for a wall-clock time written with its UTC offset, e.g. at('2024-03-10T23:30-04:00'). */
const at = (iso: string): number => Date.parse(iso);

/** Own entries only: a result object without a prototype is a valid Record<string, number>. */
const counts = (...args: Parameters<typeof countByDay>) => ({ ...countByDay(...args) });

test('counts events per day in UTC', () => {
  const events = [
    at('2024-05-01T00:00Z'),
    at('2024-05-01T12:00Z'),
    at('2024-05-01T23:59Z'),
    at('2024-05-02T08:00Z'),
  ];
  assert.deepEqual(counts(events, 'UTC'), { '2024-05-01': 3, '2024-05-02': 1 });
});

test('returns an empty object for no events', () => {
  assert.deepEqual(counts([], 'America/New_York'), {});
});

test('accepts events in any order and omits days without events', () => {
  const events = [at('2024-07-09T13:00-04:00'), at('2024-07-04T12:00-04:00'), at('2024-07-04T15:00-04:00')];
  assert.deepEqual(counts(events, 'America/New_York'), { '2024-07-04': 2, '2024-07-09': 1 });
});

test('buckets by local day in a zone far from UTC', () => {
  // Auckland is UTC+13 in January; Honolulu is UTC-10 all year.
  const auckland = [
    at('2024-01-15T00:10+13:00'), // 2024-01-14 in UTC
    at('2024-01-15T12:00+13:00'),
    at('2024-01-15T23:50+13:00'),
    at('2024-01-16T00:05+13:00'),
  ];
  assert.deepEqual(counts(auckland, 'Pacific/Auckland'), { '2024-01-15': 3, '2024-01-16': 1 });
  const honolulu = [at('2024-01-15T23:50-10:00'), at('2024-01-16T00:10-10:00')]; // both 2024-01-16 in UTC
  assert.deepEqual(counts(honolulu, 'Pacific/Honolulu'), { '2024-01-15': 1, '2024-01-16': 1 });
});

test('counts a 23-hour day when daylight saving time starts', () => {
  // New York, 2024-03-10: 02:00 EST jumps to 03:00 EDT.
  const events = [
    at('2024-03-09T23:30-05:00'),
    at('2024-03-10T00:30-05:00'),
    at('2024-03-10T01:59-05:00'),
    at('2024-03-10T03:00-04:00'),
    at('2024-03-10T23:30-04:00'),
    at('2024-03-11T00:30-04:00'),
  ];
  assert.deepEqual(counts(events, 'America/New_York'), {
    '2024-03-09': 1,
    '2024-03-10': 4,
    '2024-03-11': 1,
  });
});

test('counts a 25-hour day when daylight saving time ends', () => {
  // New York, 2024-11-03: 02:00 EDT falls back to 01:00 EST, so 01:30 happens twice.
  const events = [
    at('2024-11-02T23:45-04:00'),
    at('2024-11-03T00:15-04:00'),
    at('2024-11-03T01:30-04:00'),
    at('2024-11-03T01:30-05:00'),
    at('2024-11-03T23:45-05:00'),
    at('2024-11-04T00:15-05:00'),
  ];
  assert.deepEqual(counts(events, 'America/New_York'), {
    '2024-11-02': 1,
    '2024-11-03': 4,
    '2024-11-04': 1,
  });
});
