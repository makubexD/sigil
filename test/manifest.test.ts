/**
 * Tests for src/manifest.ts — loadManifest, saveManifest, upsertEntries, computeStatus,
 * removeEntries, sha256, and the config-entry variant upsertConfigEntry.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  loadManifest,
  saveManifest,
  upsertEntries,
  computeStatus,
  removeEntries,
  sha256,
  MANIFEST_VERSION,
  upsertConfigEntry,
} from '../dist-cli/manifest/index';
import { applyMerge, canonicalize } from '../dist-cli/config-merge/index';
import type { ConfigMergeOp } from '../dist-cli/types';

const VERSION = '0.1.0';

// ─── H — Manifest ─────────────────────────────────────────────────────────────

describe('H — Manifest (manifest.ts)', () => {
  it('sha256 returns consistent 64-char hex digest', () => {
    const hash = sha256('hello world');
    assert.equal(hash.length, 64, '64 hex chars for SHA-256');
    assert.equal(sha256('hello world'), hash, 'deterministic for same input');
    assert.notEqual(sha256('hello world!'), hash, 'different content → different hash');
  });

  it('loadManifest returns empty manifest when file absent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-test-'));
    try {
      const m = loadManifest(dir);
      assert.equal(m.manifestVersion, MANIFEST_VERSION);
      assert.deepEqual(m.entries, []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('saveManifest creates .sigil/ dir and round-trips', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-test-'));
    try {
      const manifest = { manifestVersion: MANIFEST_VERSION, entries: [] };
      saveManifest(dir, manifest);

      const reloaded = loadManifest(dir);
      assert.equal(reloaded.manifestVersion, MANIFEST_VERSION);
      assert.deepEqual(reloaded.entries, []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loadManifest throws on corrupt JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-test-'));
    try {
      fs.mkdirSync(path.join(dir, '.sigil'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.sigil', 'manifest.json'), '{ bad json }', 'utf-8');
      assert.throws(() => loadManifest(dir), /not valid JSON/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loadManifest throws on future manifestVersion', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-test-'));
    try {
      fs.mkdirSync(path.join(dir, '.sigil'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.sigil', 'manifest.json'),
        JSON.stringify({ manifestVersion: 9999, entries: [] }),
        'utf-8',
      );
      assert.throws(() => loadManifest(dir), /newer version/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('upsertEntries records primary and dependency entries with correct hashes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-test-'));
    try {
      fs.mkdirSync(path.join(dir, '.claude', 'rules'), { recursive: true });
      const depRelPath = '.claude/rules/clean-code.md';
      const depContent = '# Clean Code Rule';
      fs.writeFileSync(path.join(dir, depRelPath), depContent, 'utf-8');

      const manifest = { manifestVersion: MANIFEST_VERSION, entries: [] as any[] };
      const filesByArtifact = new Map<string, { relPaths: string[]; kind: string }>([
        ['csharp/cs-generate-tests', { relPaths: [], kind: 'skill' }],
        ['shared/clean-code', { relPaths: [depRelPath], kind: 'rule' }],
      ]);
      const depMap = new Map<string, string[]>([
        ['shared/clean-code', ['csharp/cs-generate-tests']],
      ]);

      upsertEntries(manifest as any, {
        target: 'claude',
        primaryIds: ['csharp/cs-generate-tests'],
        depMap,
        filesByArtifact,
        projectDir: dir,
        sigilVersion: '0.1.0',
        now: '2026-01-01T00:00:00Z',
      });

      assert.equal(manifest.entries.length, 2, 'two entries recorded');

      const depEntry = manifest.entries.find((e: any) => e.id === 'shared/clean-code');
      assert.ok(depEntry, 'dep entry recorded');
      assert.ok(depEntry.dependentOf.includes('csharp/cs-generate-tests'), 'parent tracked in dep');
      assert.equal(depEntry.files.length, 1, 'dep file recorded');
      assert.equal(depEntry.files[0].sha256, sha256(depContent), 'hash matches content');

      const primaryEntry = manifest.entries.find((e: any) => e.id === 'csharp/cs-generate-tests');
      assert.ok(primaryEntry, 'primary entry recorded');
      assert.deepEqual(primaryEntry.dependentOf, [], 'primary has empty dependentOf');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('computeStatus: up-to-date when on-disk hash matches recorded hash', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-test-'));
    try {
      const relPath = 'test-file.md';
      const content = '# Test content';
      fs.writeFileSync(path.join(dir, relPath), content, 'utf-8');

      const manifest = {
        manifestVersion: MANIFEST_VERSION,
        entries: [
          {
            id: 'test/skill',
            kind: 'skill',
            target: 'claude',
            sigilVersion: '0.1.0',
            files: [{ path: relPath, sha256: sha256(content) }],
            dependentOf: [],
            installedAt: '2026-01-01T00:00:00Z',
          },
        ],
      };

      const statuses = computeStatus(manifest as any, dir, new Set(['test/skill']));
      assert.equal(statuses.length, 1);
      assert.equal(statuses[0]!.status, 'up-to-date');
      assert.deepEqual(statuses[0]!.driftedFiles, []);
      assert.deepEqual(statuses[0]!.missingFiles, []);
      assert.equal(statuses[0]!.reason, undefined, 'no reason for up-to-date');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('computeStatus: missing when recorded file absent from disk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-test-'));
    try {
      const manifest = {
        manifestVersion: MANIFEST_VERSION,
        entries: [
          {
            id: 'test/skill',
            kind: 'skill',
            target: 'claude',
            sigilVersion: '0.1.0',
            files: [{ path: 'does-not-exist.md', sha256: 'abc' }],
            dependentOf: [],
            installedAt: '2026-01-01T00:00:00Z',
          },
        ],
      };

      const statuses = computeStatus(manifest as any, dir, new Set(['test/skill']));
      assert.equal(statuses[0]!.status, 'missing');
      assert.ok(statuses[0]!.missingFiles.length > 0, 'missingFiles non-empty');
      assert.match(statuses[0]!.reason ?? '', /missing file\(s\): does-not-exist\.md/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('computeStatus: drifted when file content changed since install', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-test-'));
    try {
      const relPath = 'file.md';
      fs.writeFileSync(path.join(dir, relPath), '# Modified by user', 'utf-8');

      const manifest = {
        manifestVersion: MANIFEST_VERSION,
        entries: [
          {
            id: 'test/skill',
            kind: 'skill',
            target: 'claude',
            sigilVersion: '0.1.0',
            files: [{ path: relPath, sha256: sha256('# Original content') }],
            dependentOf: [],
            installedAt: '2026-01-01T00:00:00Z',
          },
        ],
      };

      const statuses = computeStatus(manifest as any, dir, new Set(['test/skill']));
      assert.equal(statuses[0]!.status, 'drifted');
      assert.ok(statuses[0]!.driftedFiles.includes(relPath), 'driftedFiles contains the file');
      assert.match(statuses[0]!.reason ?? '', /local edits differ from installed content/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('computeStatus: orphaned when artifact id removed from catalog', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-test-'));
    try {
      const relPath = 'file.md';
      const content = '# Content';
      fs.writeFileSync(path.join(dir, relPath), content, 'utf-8');

      const manifest = {
        manifestVersion: MANIFEST_VERSION,
        entries: [
          {
            id: 'removed/skill',
            kind: 'skill',
            target: 'claude',
            sigilVersion: '0.1.0',
            files: [{ path: relPath, sha256: sha256(content) }],
            dependentOf: [],
            installedAt: '2026-01-01T00:00:00Z',
          },
        ],
      };

      // catalogIds does NOT include 'removed/skill'
      const statuses = computeStatus(manifest as any, dir, new Set(['some/other-artifact']));
      assert.equal(statuses[0]!.status, 'orphaned');
      assert.equal(statuses[0]!.reason, 'no longer present in the bundled catalog');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('computeStatus: outdated with a template-revision reason when the recorded revision is stale', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-test-'));
    try {
      const relPath = 'file.md';
      const content = '# Content';
      fs.writeFileSync(path.join(dir, relPath), content, 'utf-8');

      const manifest = {
        manifestVersion: MANIFEST_VERSION,
        entries: [
          {
            id: 'test/skill',
            kind: 'skill',
            target: 'claude',
            sigilVersion: '0.1.0',
            files: [{ path: relPath, sha256: sha256(content) }],
            dependentOf: [],
            installedAt: '2026-01-01T00:00:00Z',
            template: { id: 'shared/templates/workflow-skill', revision: 2 },
          },
        ],
      };

      const currentTemplateOf = (id: string) =>
        id === 'test/skill' ? { id: 'shared/templates/workflow-skill', revision: 3 } : undefined;

      const statuses = computeStatus(manifest as any, dir, new Set(['test/skill']), {
        currentTemplateOf,
      });
      assert.equal(statuses[0]!.status, 'outdated');
      assert.equal(statuses[0]!.reason, 'template shared/templates/workflow-skill rev 2→3');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('computeStatus: up-to-date (not outdated) when the recorded template revision still matches', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-test-'));
    try {
      const relPath = 'file.md';
      const content = '# Content';
      fs.writeFileSync(path.join(dir, relPath), content, 'utf-8');

      const manifest = {
        manifestVersion: MANIFEST_VERSION,
        entries: [
          {
            id: 'test/skill',
            kind: 'skill',
            target: 'claude',
            sigilVersion: '0.1.0',
            files: [{ path: relPath, sha256: sha256(content) }],
            dependentOf: [],
            installedAt: '2026-01-01T00:00:00Z',
            template: { id: 'shared/templates/workflow-skill', revision: 3 },
          },
        ],
      };

      const currentTemplateOf = (id: string) =>
        id === 'test/skill' ? { id: 'shared/templates/workflow-skill', revision: 3 } : undefined;

      const statuses = computeStatus(manifest as any, dir, new Set(['test/skill']), {
        currentTemplateOf,
      });
      assert.equal(statuses[0]!.status, 'up-to-date');
      assert.equal(statuses[0]!.reason, undefined);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('removeEntries: shared dep file NOT deleted when another primary still uses it', () => {
    const manifest = {
      manifestVersion: MANIFEST_VERSION,
      entries: [
        {
          id: 'csharp/cs-generate-tests',
          kind: 'skill',
          target: 'claude',
          sigilVersion: '0.1.0',
          files: [{ path: '.claude/skills/xunit/SKILL.md', sha256: 'aaa' }],
          dependentOf: [],
          installedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'python/py-pytest-testing',
          kind: 'skill',
          target: 'claude',
          sigilVersion: '0.1.0',
          files: [{ path: '.claude/skills/pytest/SKILL.md', sha256: 'bbb' }],
          dependentOf: [],
          installedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'shared/code-reviewer',
          kind: 'agent',
          target: 'claude',
          sigilVersion: '0.1.0',
          files: [{ path: '.claude/agents/code-reviewer.md', sha256: 'ccc' }],
          dependentOf: ['csharp/cs-generate-tests', 'python/py-pytest-testing'],
          installedAt: '2026-01-01T00:00:00Z',
        },
      ],
    };

    const { pathsToDelete } = removeEntries(
      manifest as any,
      ['csharp/cs-generate-tests'],
      'claude',
    );

    assert.ok(
      !pathsToDelete.includes('.claude/agents/code-reviewer.md'),
      'shared dep preserved (pytest still uses it)',
    );
    assert.ok(
      pathsToDelete.includes('.claude/skills/xunit/SKILL.md'),
      'xunit skill file scheduled for deletion',
    );
  });

  it('removeEntries: dep dependentOf cleared when its last primary is removed', () => {
    const manifest = {
      manifestVersion: MANIFEST_VERSION,
      entries: [
        {
          id: 'csharp/cs-generate-tests',
          kind: 'skill',
          target: 'claude',
          sigilVersion: '0.1.0',
          files: [{ path: '.claude/skills/xunit/SKILL.md', sha256: 'aaa' }],
          dependentOf: [],
          installedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'shared/code-reviewer',
          kind: 'agent',
          target: 'claude',
          sigilVersion: '0.1.0',
          files: [{ path: '.claude/agents/code-reviewer.md', sha256: 'ccc' }],
          dependentOf: ['csharp/cs-generate-tests'],
          installedAt: '2026-01-01T00:00:00Z',
        },
      ],
    };

    // Removing xunit — it's the ONLY dependent of code-reviewer
    const { pathsToDelete } = removeEntries(
      manifest as any,
      ['csharp/cs-generate-tests'],
      'claude',
    );

    // Primary file is deleted
    assert.ok(pathsToDelete.includes('.claude/skills/xunit/SKILL.md'), 'primary file deleted');
    // Dep file NOT auto-deleted (user must run `sigil uninstall shared/code-reviewer` explicitly)
    assert.ok(
      !pathsToDelete.includes('.claude/agents/code-reviewer.md'),
      'dep file not auto-deleted (requires explicit uninstall)',
    );
    // But dependentOf is cleared in the manifest
    const reviewerEntry = manifest.entries.find((e: any) => e.id === 'shared/code-reviewer');
    assert.ok(reviewerEntry, 'code-reviewer entry remains in manifest');
    assert.deepEqual(reviewerEntry.dependentOf, [], 'dependentOf cleared after primary removed');
  });
});

// ─── L — Manifest config entries ──────────────────────────────────────────────

describe('L — Manifest config entries (manifest.ts)', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-manifest-config-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeOp(file: string): ConfigMergeOp {
    return {
      file,
      fragment: { model: 'claude-opus-4-8' },
      strategy: {},
    };
  }

  it('upsertConfigEntry records configFiles with fragmentSha256', () => {
    const manifest = { manifestVersion: 2, entries: [] as any[] };
    const op = makeOp('.claude/settings.json');
    upsertConfigEntry(manifest as any, {
      id: 'shared/allow-dev-tools',
      kind: 'settings',
      target: 'claude',
      ops: [op],
      dependentOf: [],
      sigilVersion: VERSION,
      now: '2026-01-01T00:00:00Z',
    });
    assert.equal(manifest.entries.length, 1);
    const entry = manifest.entries[0];
    assert.equal(entry.kind, 'settings');
    assert.ok(Array.isArray(entry.configFiles));
    assert.equal(entry.configFiles.length, 1);
    assert.ok(entry.configFiles[0].fragmentSha256.length === 64, '64-char hex sha256');
  });

  it('upsertConfigEntry merges parentIds on re-install', () => {
    const manifest = { manifestVersion: 2, entries: [] as any[] };
    const op = makeOp('.claude/settings.json');
    upsertConfigEntry(manifest as any, {
      id: 'shared/allow-dev-tools',
      kind: 'settings',
      target: 'claude',
      ops: [op],
      dependentOf: ['skill-a'],
      sigilVersion: VERSION,
      now: '2026-01-01T00:00:00Z',
    });
    upsertConfigEntry(manifest as any, {
      id: 'shared/allow-dev-tools',
      kind: 'settings',
      target: 'claude',
      ops: [op],
      dependentOf: ['skill-b'],
      sigilVersion: VERSION,
      now: '2026-01-01T00:00:00Z',
    });
    const entry = manifest.entries[0];
    assert.ok(entry.dependentOf.includes('skill-a'));
    assert.ok(entry.dependentOf.includes('skill-b'));
  });

  it('computeStatus: config entry is up-to-date when fragment intact', () => {
    // Write a settings.json with sigil's fragment already applied
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    const op = makeOp('.claude/settings.json');
    const installed = applyMerge({}, op);
    fs.writeFileSync(settingsPath, canonicalize(installed), 'utf-8');

    const manifest = { manifestVersion: 2, entries: [] as any[] };
    upsertConfigEntry(manifest as any, {
      id: 'shared/allow-dev-tools',
      kind: 'settings',
      target: 'claude',
      ops: [op],
      dependentOf: [],
      sigilVersion: VERSION,
      now: '2026-01-01T00:00:00Z',
    });

    const { computeStatus: computeStatus2 } = require('../dist-cli/manifest/index');
    const results = computeStatus2(manifest, tmpDir, new Set(['shared/allow-dev-tools']));
    assert.equal(results[0].status, 'up-to-date');
  });

  it('computeStatus: config entry is drifted when sigil fragment removed', () => {
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    // Write a file WITHOUT sigil's model key
    fs.writeFileSync(settingsPath, JSON.stringify({ env: { MY_VAR: 'x' } }), 'utf-8');

    const op = makeOp('.claude/settings.json');
    const manifest = { manifestVersion: 2, entries: [] as any[] };
    upsertConfigEntry(manifest as any, {
      id: 'shared/allow-dev-tools',
      kind: 'settings',
      target: 'claude',
      ops: [op],
      dependentOf: [],
      sigilVersion: VERSION,
      now: '2026-01-01T00:00:00Z',
    });

    const { computeStatus: computeStatus2 } = require('../dist-cli/manifest/index');
    const results = computeStatus2(manifest, tmpDir, new Set(['shared/allow-dev-tools']));
    assert.equal(results[0].status, 'drifted');
  });

  it('computeStatus: user editing their own keys is NOT drifted', () => {
    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    // Apply sigil's op first, then add a user key on top
    const op = makeOp('.claude/settings.json');
    const installed = applyMerge({}, op);
    const withUserKey = { ...installed, myOwnKey: 'user-value' };
    fs.writeFileSync(settingsPath, JSON.stringify(withUserKey), 'utf-8');

    const manifest = { manifestVersion: 2, entries: [] as any[] };
    upsertConfigEntry(manifest as any, {
      id: 'shared/allow-dev-tools',
      kind: 'settings',
      target: 'claude',
      ops: [op],
      dependentOf: [],
      sigilVersion: VERSION,
      now: '2026-01-01T00:00:00Z',
    });

    const { computeStatus: computeStatus2 } = require('../dist-cli/manifest/index');
    const results = computeStatus2(manifest, tmpDir, new Set(['shared/allow-dev-tools']));
    assert.equal(results[0].status, 'up-to-date', 'user key edit is not drift');
  });
});
