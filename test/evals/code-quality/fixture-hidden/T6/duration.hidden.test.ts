import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration } from '../src/duration.ts';

test('parses single and combined units', () => {
  assert.equal(parseDuration('2d'), 2 * 86_400_000);
  assert.equal(parseDuration('1h30m'), 5_400_000);
  assert.equal(parseDuration('1h 5m'), 3_900_000);
  assert.equal(parseDuration('45s'), 45_000);
  assert.equal(parseDuration('500ms'), 500);
  assert.equal(parseDuration('1d2h3m4s5ms'), 86_400_000 + 7_200_000 + 180_000 + 4_000 + 5);
  assert.equal(parseDuration('0s'), 0);
});

test('tells m from ms', () => {
  assert.equal(parseDuration('1m500ms'), 60_500);
});

test('rejects anything else with RangeError', () => {
  for (const bad of ['', ' ', '5', '1x', '1m1h', '1h1h', '-1s', '1.5h', '1h  5m', ' 1h', '1h ', 'h']) {
    assert.throws(() => parseDuration(bad), RangeError, JSON.stringify(bad));
  }
});
