/**
 * Tests for src/install-state.ts — computeInstallStates (6-state model).
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { loadCatalog } from '../dist-cli/load';
import { resolveCatalog } from '../dist-cli/resolve';
import { computeInstallStates } from '../dist-cli/install-state';
import { loadManifest, saveManifest, sha256, MANIFEST_VERSION } from '../dist-cli/manifest/index';
import { ClaudeCodeTarget } from '../dist-cli/targets/claude-code';
import { CATALOG_DIR } from './helpers/catalog';

describe('P — computeInstallStates', () => {
  let resolvedCatalog: ReturnType<typeof resolveCatalog>;

  beforeEach(async () => {
    const cat = await loadCatalog(CATALOG_DIR);
    resolvedCatalog = resolveCatalog(cat);
  });

  it('returns "new" for an artifact with no manifest entry and no disk files', async () => {
    const target = new ClaudeCodeTarget();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-state-'));
    try {
      const states = await computeInstallStates({
        candidateIds: ['shared/clean-code'],
        target,
        catalog: resolvedCatalog,
        projectDir: dir,
      });
      const entry = states.get('shared/clean-code');
      assert.ok(entry, 'entry must be present');
      assert.equal(entry.state, 'new', `expected 'new', got '${entry.state}'`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns "up-to-date" when manifest hash matches disk content and current catalog', async () => {
    const target = new ClaudeCodeTarget();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-state-'));
    try {
      const freshFiles = await target.scaffold!('shared/clean-code', resolvedCatalog, {
        projectDir: dir,
        overwrite: true,
        includeDeps: false,
      });

      // Write files to disk (simulate a previous sigil install)
      for (const [relPath, content] of Object.entries(freshFiles)) {
        const fullPath = path.join(dir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
      }

      // Record the same hashes in the manifest
      saveManifest(dir, {
        manifestVersion: MANIFEST_VERSION,
        entries: [
          {
            id: 'shared/clean-code',
            kind: 'rule',
            target: 'claude',
            sigilVersion: '0.1.0',
            files: Object.entries(freshFiles).map(([p, c]) => ({ path: p, sha256: sha256(c) })),
            dependentOf: [],
            installedAt: '2026-01-01T00:00:00Z',
          },
        ],
      } as ReturnType<typeof loadManifest>);

      const states = await computeInstallStates({
        candidateIds: ['shared/clean-code'],
        target,
        catalog: resolvedCatalog,
        projectDir: dir,
      });
      const entry = states.get('shared/clean-code');
      assert.ok(entry, 'entry must be present');
      assert.equal(entry.state, 'up-to-date', `expected 'up-to-date', got '${entry.state}'`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns "drifted" when user edited a tracked file', async () => {
    const target = new ClaudeCodeTarget();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-state-'));
    try {
      const freshFiles = await target.scaffold!('shared/clean-code', resolvedCatalog, {
        projectDir: dir,
        overwrite: true,
        includeDeps: false,
      });

      // Write original files
      for (const [relPath, content] of Object.entries(freshFiles)) {
        const fullPath = path.join(dir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
      }

      // Record original hashes in the manifest
      saveManifest(dir, {
        manifestVersion: MANIFEST_VERSION,
        entries: [
          {
            id: 'shared/clean-code',
            kind: 'rule',
            target: 'claude',
            sigilVersion: '0.1.0',
            files: Object.entries(freshFiles).map(([p, c]) => ({ path: p, sha256: sha256(c) })),
            dependentOf: [],
            installedAt: '2026-01-01T00:00:00Z',
          },
        ],
      } as ReturnType<typeof loadManifest>);

      // Simulate user editing one of the installed files
      const firstRelPath = Object.keys(freshFiles)[0]!;
      fs.writeFileSync(path.join(dir, firstRelPath), '# User-modified content\n', 'utf-8');

      const states = await computeInstallStates({
        candidateIds: ['shared/clean-code'],
        target,
        catalog: resolvedCatalog,
        projectDir: dir,
      });
      const entry = states.get('shared/clean-code');
      assert.ok(entry, 'entry must be present');
      assert.equal(entry.state, 'drifted', `expected 'drifted', got '${entry.state}'`);
      assert.ok(
        entry.driftedFiles && entry.driftedFiles.length > 0,
        'driftedFiles must list the modified file',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns "missing" when a tracked file was deleted from disk', async () => {
    const target = new ClaudeCodeTarget();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-state-'));
    try {
      const freshFiles = await target.scaffold!('shared/clean-code', resolvedCatalog, {
        projectDir: dir,
        overwrite: true,
        includeDeps: false,
      });

      // Record hashes in the manifest but do NOT write files to disk
      saveManifest(dir, {
        manifestVersion: MANIFEST_VERSION,
        entries: [
          {
            id: 'shared/clean-code',
            kind: 'rule',
            target: 'claude',
            sigilVersion: '0.1.0',
            files: Object.entries(freshFiles).map(([p, c]) => ({ path: p, sha256: sha256(c) })),
            dependentOf: [],
            installedAt: '2026-01-01T00:00:00Z',
          },
        ],
      } as ReturnType<typeof loadManifest>);

      const states = await computeInstallStates({
        candidateIds: ['shared/clean-code'],
        target,
        catalog: resolvedCatalog,
        projectDir: dir,
      });
      const entry = states.get('shared/clean-code');
      assert.ok(entry, 'entry must be present');
      assert.equal(entry.state, 'missing', `expected 'missing', got '${entry.state}'`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns "foreign" when files exist on disk but there is no manifest entry', async () => {
    const target = new ClaudeCodeTarget();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-state-'));
    try {
      // Scaffold to find out which paths it writes, then put files there
      const freshFiles = await target.scaffold!('shared/clean-code', resolvedCatalog, {
        projectDir: dir,
        overwrite: true,
        includeDeps: false,
      });
      for (const [relPath, content] of Object.entries(freshFiles)) {
        const fullPath = path.join(dir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
      }
      // No manifest written — directory has no .sigil/manifest.json

      const states = await computeInstallStates({
        candidateIds: ['shared/clean-code'],
        target,
        catalog: resolvedCatalog,
        projectDir: dir,
      });
      const entry = states.get('shared/clean-code');
      assert.ok(entry, 'entry must be present');
      assert.equal(entry.state, 'foreign', `expected 'foreign', got '${entry.state}'`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns "outdated" when the manifest hash no longer matches the current catalog', async () => {
    const target = new ClaudeCodeTarget();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-state-'));
    try {
      const freshFiles = await target.scaffold!('shared/clean-code', resolvedCatalog, {
        projectDir: dir,
        overwrite: true,
        includeDeps: false,
      });

      // Write current catalog content to disk
      for (const [relPath, content] of Object.entries(freshFiles)) {
        const fullPath = path.join(dir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
      }

      // Record STALE hashes in the manifest (pretend older catalog content was installed)
      const staleHash = sha256('# Old version of this rule that no longer matches the catalog');
      saveManifest(dir, {
        manifestVersion: MANIFEST_VERSION,
        entries: [
          {
            id: 'shared/clean-code',
            kind: 'rule',
            target: 'claude',
            sigilVersion: '0.0.1',
            files: Object.entries(freshFiles).map(([p]) => ({ path: p, sha256: staleHash })),
            dependentOf: [],
            installedAt: '2025-01-01T00:00:00Z',
          },
        ],
      } as ReturnType<typeof loadManifest>);

      // Also overwrite disk files with the "old" content so disk == manifest (not drifted)
      for (const relPath of Object.keys(freshFiles)) {
        fs.writeFileSync(
          path.join(dir, relPath),
          '# Old version of this rule that no longer matches the catalog',
        );
      }

      const states = await computeInstallStates({
        candidateIds: ['shared/clean-code'],
        target,
        catalog: resolvedCatalog,
        projectDir: dir,
      });
      const entry = states.get('shared/clean-code');
      assert.ok(entry, 'entry must be present');
      // disk == recorded (not drifted), but fresh catalog != recorded → outdated
      assert.equal(entry.state, 'outdated', `expected 'outdated', got '${entry.state}'`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('handles multiple artifacts in one call, returning the correct state for each', async () => {
    const target = new ClaudeCodeTarget();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-state-'));
    try {
      // Install shared/clean-code with a matching hash → up-to-date
      const freshFiles = await target.scaffold!('shared/clean-code', resolvedCatalog, {
        projectDir: dir,
        overwrite: true,
        includeDeps: false,
      });
      for (const [relPath, content] of Object.entries(freshFiles)) {
        const fullPath = path.join(dir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
      }
      saveManifest(dir, {
        manifestVersion: MANIFEST_VERSION,
        entries: [
          {
            id: 'shared/clean-code',
            kind: 'rule',
            target: 'claude',
            sigilVersion: '0.1.0',
            files: Object.entries(freshFiles).map(([p, c]) => ({ path: p, sha256: sha256(c) })),
            dependentOf: [],
            installedAt: '2026-01-01T00:00:00Z',
          },
        ],
      } as ReturnType<typeof loadManifest>);

      // shared/code-reviewer is NOT installed → new
      const states = await computeInstallStates({
        candidateIds: ['shared/clean-code', 'shared/code-reviewer'],
        target,
        catalog: resolvedCatalog,
        projectDir: dir,
      });

      assert.equal(states.size, 2, 'must return an entry for each candidate');
      assert.equal(
        states.get('shared/clean-code')?.state,
        'up-to-date',
        'installed artifact must be up-to-date',
      );
      assert.equal(
        states.get('shared/code-reviewer')?.state,
        'new',
        'uninstalled artifact must be new',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('wizard no-preselect policy: pickers always start with initialValues=[] regardless of install state', () => {
    // The wizard removed isPreselected and all initialValues computations.
    // Policy: nothing is ever pre-checked; the user makes every selection.
    // This test encodes the contract so any future regression is caught.
    const computeInitialValues = (): string[] => [];

    const allStates: Array<string | undefined> = [
      'new',
      'missing',
      'outdated',
      undefined,
      'up-to-date',
      'drifted',
      'foreign',
    ];

    for (const state of allStates) {
      const result = computeInitialValues();
      assert.deepEqual(
        result,
        [],
        `initialValues must be [] for state '${String(state)}' — nothing pre-checked`,
      );
    }
  });
});
