/**
 * scripts/listing-load.cjs measures the skill and agent listing a session carries before the first
 * prompt, per language. The listing is paid on every session, so it is held to a recorded baseline
 * the way rule bytes are (test/rule-load.test.ts).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CATALOG_DIR } from './helpers/catalog';

interface ListedItem {
  id: string;
  kind: string;
  bytes: number;
}
interface GroupLoad {
  items: ListedItem[];
  bytes: number;
}
interface ListingLoadReport {
  groups: Record<string, GroupLoad>;
}

interface Baseline {
  bytes: number;
  reason: string;
}

const { listingLoad, BASELINE_PATH, SLACK_BYTES } = require(
  path.join(CATALOG_DIR, '..', 'scripts', 'listing-load.cjs'),
) as {
  listingLoad: (catalogDir: string) => Promise<ListingLoadReport>;
  BASELINE_PATH: string;
  SLACK_BYTES: number;
};

describe('scripts/listing-load.cjs', () => {
  it('counts skills and agents only, and leaves out skills the model cannot invoke', async () => {
    const { groups } = await listingLoad(CATALOG_DIR);
    const items = Object.values(groups).flatMap(group => group.items);
    assert.ok(items.length > 0);
    assert.deepEqual([...new Set(items.map(item => item.kind))].sort(), ['agent', 'skill']);
    const ids = items.map(item => item.id);
    assert.ok(ids.includes('typescript/ts-generate-tests'));
    assert.ok(!ids.includes('shared/feature'), 'shared/feature sets disableModelInvocation');
  });

  it('reports a total equal to the sum of its items, for every group', async () => {
    const { groups } = await listingLoad(CATALOG_DIR);
    for (const [group, load] of Object.entries(groups)) {
      const sum = load.items.reduce((total, item) => total + item.bytes, 0);
      assert.equal(load.bytes, sum, group);
      assert.ok(load.bytes > 0, group);
    }
  });

  // Growth needs a recorded reason; a drop must lower the baseline so the room cannot be refilled
  // silently.
  it('keeps every group within its recorded listing-load baseline', async () => {
    const { groups } = await listingLoad(CATALOG_DIR);
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Record<string, Baseline>;
    const fix = 'npm run listing-load -- --baseline "<why>"';
    for (const [group, load] of Object.entries(groups)) {
      const recorded = baseline[group];
      assert.ok(recorded?.reason, `${group}: no baseline with a reason; run ${fix}`);
      assert.ok(
        load.bytes <= recorded.bytes,
        `${group} grew ${recorded.bytes} -> ${load.bytes} bytes; if intended, run ${fix}`,
      );
      assert.ok(
        recorded.bytes - load.bytes <= SLACK_BYTES,
        `${group} shrank ${recorded.bytes} -> ${load.bytes} bytes; lower the baseline: ${fix}`,
      );
    }
  });
});
