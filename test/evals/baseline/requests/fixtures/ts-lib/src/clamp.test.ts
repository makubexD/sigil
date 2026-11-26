import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clamp } from './clamp.ts';

describe('clamp', () => {
  it('returns the value when it is inside the range', () => {
    assert.equal(clamp(5, 0, 10), 5);
  });

  it('returns the nearest bound when the value is outside the range', () => {
    assert.equal(clamp(-3, 0, 10), 0);
    assert.equal(clamp(42, 0, 10), 10);
  });

  it('throws when min exceeds max', () => {
    assert.throws(() => clamp(1, 10, 0), RangeError);
  });
});
