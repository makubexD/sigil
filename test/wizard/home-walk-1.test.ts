/**
 * Shard 1 of the seeded random walk through the home menu (see `helpers/home-walk.ts`).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SHARDS, walkShard } from '../helpers/home-walk';

describe('home menu random walk', () => {
  it(`should never loop, re-ask, or write into a risky folder (shard 1 of ${SHARDS})`, async () => {
    await walkShard(1);
  });
});

describe('home menu random walk shards', () => {
  it('should have one test file for each shard, so no seed goes unwalked', () => {
    const files = fs.readdirSync(__dirname).filter(name => /^home-walk-\d+\.test\.js$/.test(name));
    assert.equal(files.length, SHARDS);
  });
});
