/**
 * Guards sigil's public library surface (src/index.ts, package.json's "exports" map).
 *
 * 2026-08-22 audit F25: sigil shipped its entire compiled dist-cli/ tree with no "exports" map,
 * so every internal module was accidentally deep-importable. Fixed by adding a curated
 * src/index.ts + an "exports" map that exposes only "." and "./package.json". This test asserts
 * the intended public surface is present and — via require.resolve, which walks the same
 * package-name resolution "exports" governs — that a deep import into an internal module is
 * refused with ERR_PACKAGE_PATH_NOT_EXPORTED, not silently allowed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
// Compile-time guard (round-4 audit F35): ConfigRoot is a string-literal union, so a consumer
// could pass a bare literal without importing it — but a consumer who wants to *name* the type
// (e.g. `function pickRoot(): ConfigRoot`) had no way to, since it wasn't re-exported from the
// package root despite ConfigMergeOp.root referencing it. This import fails tsc if the type
// surface regresses; there is no runtime assertion possible for a type-only export.
import type { ConfigRoot } from '../dist-cli/index';
const _configRootIsImportable: ConfigRoot = 'project';
void _configRootIsImportable;

const projectRoot = path.resolve(__dirname, '..');
const requireFromRoot = createRequire(path.join(projectRoot, 'noop.js'));

describe('Public library surface (F25)', () => {
  it('exposes the intended config-merge primitives from the package root', () => {
    const publicApi = requireFromRoot('./dist-cli/index.js');
    const expected = [
      'applyMerge',
      'reverseMerge',
      'detectConfigDrift',
      'classifyConfigDrift',
      'deepEqual',
      'pruneEmpty',
      'canonicalize',
      'serialize',
    ];
    for (const name of expected) {
      assert.equal(typeof publicApi[name], 'function', `${name} is exported as a function`);
    }
  });

  it('refuses a deep import into an internal module via package-name resolution', () => {
    assert.throws(
      () => requireFromRoot('sigil/dist-cli/config-merge/drift.js'),
      (err: unknown) => (err as NodeJS.ErrnoException).code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
      'internal module must not be reachable through the package name',
    );
  });

  it('still resolves the package root through its own name (self-reference)', () => {
    const publicApi = requireFromRoot('sigil');
    assert.equal(typeof publicApi.classifyConfigDrift, 'function');
  });
});
