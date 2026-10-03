/**
 * Shard 2 of the seeded random walk through the home menu (see `helpers/home-walk.ts`).
 */
import { describe, it } from 'node:test';
import { SHARDS, walkShard } from '../helpers/home-walk';

describe('home menu random walk', () => {
  it(`should never loop, re-ask, or write into a risky folder (shard 2 of ${SHARDS})`, async () => {
    await walkShard(2);
  });
});
