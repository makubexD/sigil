/**
 * Every consumer command and wizard action loads and validates the catalog through
 * `requireValidCatalog`. One wizard session (and one test process) ran it about 130 times on an
 * unchanged catalog, and on Windows each load opens ~180 files. The cache reuses a validated catalog
 * while no file under the catalog changed (path, size, modified time, file id), and hands every
 * caller its own copy, because callers edit what they get.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cachedValidCatalog } from '../dist-cli/catalog-cache';
import { loadValidCatalog } from '../dist-cli/cli-helpers';
import { withTempDirAsync } from './helpers/temp-dir';

const rule = (id: string, body = '- **P.** x') =>
  `---\nid: ${id}\nkind: rule\ntitle: P\ndescription: A probe.\nappliesTo:\n  - "**/*"\n---\n\n${body}\n`;

/** A loader that counts how often it really reads the catalog. */
function countingLoader() {
  const counter = { loads: 0 };
  const load = async (dir: string) => {
    counter.loads++;
    return loadValidCatalog(dir);
  };
  return { counter, load };
}

async function withCatalog(fn: (dir: string, file: string) => Promise<void>): Promise<void> {
  await withTempDirAsync(async dir => {
    const file = path.join(dir, 'shared/rules/p.rule.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, rule('shared/p'));
    await fn(dir, file);
  });
}

describe('cachedValidCatalog', () => {
  it('should read an unchanged catalog once', async () => {
    await withCatalog(async dir => {
      const { counter, load } = countingLoader();
      await cachedValidCatalog(dir, load);
      await cachedValidCatalog(dir, load);
      await cachedValidCatalog(dir, load);
      assert.equal(counter.loads, 1);
    });
  });

  it('should give every caller its own copy', async () => {
    await withCatalog(async dir => {
      const { load } = countingLoader();
      const first = await cachedValidCatalog(dir, load);
      first.artifacts[0]!.frontmatter.title = 'edited';
      const second = await cachedValidCatalog(dir, load);
      assert.equal(second.artifacts[0]!.frontmatter.title, 'P');
      assert.equal(second.byId.get('shared/p'), second.artifacts[0], 'byId points into the copy');
    });
  });

  it('should read again when a file changes, is added, or is removed', async () => {
    await withCatalog(async (dir, file) => {
      const { counter, load } = countingLoader();
      await cachedValidCatalog(dir, load);
      fs.writeFileSync(file, rule('shared/p', '- **Q.** a longer body'));
      const changed = await cachedValidCatalog(dir, load);
      assert.match(changed.artifacts[0]!.body, /Q\./);
      const added = path.join(dir, 'shared/rules/q.rule.md');
      fs.writeFileSync(added, rule('shared/q'));
      assert.equal((await cachedValidCatalog(dir, load)).artifacts.length, 2);
      fs.rmSync(added);
      assert.equal((await cachedValidCatalog(dir, load)).artifacts.length, 1);
      assert.equal(counter.loads, 4);
    });
  });

  it('should not keep a catalog that fails validation', async () => {
    await withCatalog(async (dir, file) => {
      const { counter, load } = countingLoader();
      fs.writeFileSync(file, rule('shared/p').replace('kind: rule', 'kind: rule\nseverity: bogus'));
      await assert.rejects(cachedValidCatalog(dir, load), /validation errors/);
      await assert.rejects(cachedValidCatalog(dir, load), /validation errors/);
      assert.equal(counter.loads, 2);
    });
  });
});
