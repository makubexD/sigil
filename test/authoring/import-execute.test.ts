/**
 * Tests for src/authoring/import/execute.ts's trust-scan wiring (2026-08-23 round-4 audit, F30).
 *
 * `sigil import` brings externally-authored content into the catalog — the one real trust
 * boundary in sigil's whole CLI surface — yet the trust scanner's only production call site was
 * `sigil check --trust`, a separate opt-in command run against files already inside the catalog.
 * This asserts an import carrying an error-level trust finding (a secret) is blocked before any
 * write, and a clean import proceeds normally.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { executeImport } from '../../dist-cli/authoring/import/execute';
import { loadCatalog } from '../../dist-cli/load';
import { getAllTargets } from '../../dist-cli/targets';
import { withTempDir } from '../helpers/temp-dir';
import { CATALOG_DIR } from '../helpers/catalog';
import type { ImportItem } from '../../dist-cli/authoring/import/plan';

function makeItem(destPath: string, body: string, idSuffix: string): ImportItem {
  return {
    sourcePath: destPath,
    relativePath: `probe-${idSuffix}.md`,
    frontmatter: {
      id: `shared/import-probe-${idSuffix}`,
      kind: 'rule',
      title: 'Import Probe',
      description: 'F30 trust-scan-on-import probe artifact',
      language: 'any',
      tags: [],
      appliesTo: ['**/*.ts'],
    },
    body,
    destPath,
    droppedFields: [],
    conflicts: false,
  };
}

describe('executeImport — trust scan on write (F30)', () => {
  it('blocks an import whose body carries an error-level secret finding', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const targets = getAllTargets();
    withTempDir(dir => {
      const destPath = path.join(dir, 'secret.rule.md');
      const item = makeItem(destPath, 'token=gho_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789AB', 'secret');
      const result = executeImport([item], catalog, targets);
      assert.equal(result.errors, 1);
      assert.equal(result.written, 0);
      assert.ok(!fs.existsSync(destPath), 'a flagged import must never be written to disk');
      const fileResult = result.fileResults[0];
      assert.ok(fileResult, 'expected one file result');
      assert.ok(
        fileResult.violations.some(v => v.includes('[trust]')),
        'violation list must include the trust finding',
      );
    });
  });

  it('writes a clean import with no trust findings', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const targets = getAllTargets();
    withTempDir(dir => {
      const destPath = path.join(dir, 'clean.rule.md');
      const item = makeItem(destPath, 'This body has no secrets or injection payloads.', 'clean');
      const result = executeImport([item], catalog, targets);
      assert.equal(result.written, 1);
      assert.equal(result.errors, 0);
      assert.ok(fs.existsSync(destPath));
    });
  });
});
