/**
 * `detectProjectContext` reads the folder sigil was started in; `recommendNext` turns that into
 * the ordered list of things the home menu suggests. Both are pure, so every state is a fixture.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { detectProjectContext, recommendNext } from '../dist-cli/project-context';
import type { ProjectContext } from '../dist-cli/project-context';
import { saveManifest, sha256 } from '../dist-cli/manifest';
import type { ManifestEntry } from '../dist-cli/manifest/types';
import { withTempDir } from './helpers/temp-dir';

function touch(dir: string, relative: string, content = ''): void {
  const full = path.join(dir, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

/** Records a whole-file artifact in the manifest; writes the file unless `content` is null. */
function entry(
  dir: string,
  id: string,
  relative: string,
  content: string | null,
  recordedContent = content ?? '',
): ManifestEntry {
  if (content !== null) touch(dir, relative, content);
  return {
    id,
    kind: 'rule',
    target: 'claude',
    sigilVersion: '0.0.0',
    files: [{ path: relative, sha256: sha256(recordedContent) }],
    dependentOf: [],
    installedAt: '2026-01-01T00:00:00.000Z',
  } as ManifestEntry;
}

function install(dir: string, entries: ManifestEntry[]): void {
  saveManifest(dir, { manifestVersion: 2, entries });
}

function context(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    projectDir: '/work/app',
    detectedTargets: ['claude'],
    manifestPresent: true,
    installed: 3,
    health: { 'up-to-date': 3, outdated: 0, drifted: 0, orphaned: 0, missing: 0 },
    isCatalogCheckout: false,
    looksLikeProject: true,
    isHomeDir: false,
    ...overrides,
  };
}

describe('detectProjectContext', () => {
  it('should describe an empty folder as unconfigured', () => {
    withTempDir(dir => {
      const ctx = detectProjectContext(dir);
      assert.deepEqual(ctx.detectedTargets, []);
      assert.equal(ctx.manifestPresent, false);
      assert.equal(ctx.installed, 0);
      assert.equal(ctx.looksLikeProject, false);
      assert.equal(ctx.isCatalogCheckout, false);
      assert.equal(ctx.isHomeDir, false);
    });
  });

  it('should report every target whose marker folder exists, without a silent default', () => {
    withTempDir(dir => {
      fs.mkdirSync(path.join(dir, '.claude'));
      assert.deepEqual(detectProjectContext(dir).detectedTargets, ['claude']);
      fs.mkdirSync(path.join(dir, '.github'));
      assert.deepEqual(detectProjectContext(dir).detectedTargets, ['claude', 'copilot']);
    });
  });

  it('should recognise a project by common marker files', () => {
    for (const marker of ['.git/HEAD', 'package.json', 'pyproject.toml', 'App.csproj', 'x.sln']) {
      withTempDir(dir => {
        touch(dir, marker);
        assert.equal(detectProjectContext(dir).looksLikeProject, true, marker);
      });
    }
  });

  it('should recognise a catalog checkout by catalog/ plus packs.yaml', () => {
    withTempDir(dir => {
      fs.mkdirSync(path.join(dir, 'catalog'));
      assert.equal(detectProjectContext(dir).isCatalogCheckout, false);
      touch(dir, 'packs.yaml', 'packs: []\n');
      assert.equal(detectProjectContext(dir).isCatalogCheckout, true);
    });
  });

  it('should recognise the home folder (injected, so the test never reads the real one)', () => {
    withTempDir(dir => {
      assert.equal(detectProjectContext(dir, { homeDir: dir }).isHomeDir, true);
      assert.equal(
        detectProjectContext(dir, { homeDir: path.join(dir, 'other') }).isHomeDir,
        false,
      );
    });
  });

  it('should count installed artifacts by health: up-to-date, missing, drifted', () => {
    withTempDir(dir => {
      install(dir, [
        entry(dir, 'a/intact', '.claude/rules/a.md', 'same'),
        entry(dir, 'b/gone', '.claude/rules/b.md', null, 'was here'),
        entry(dir, 'c/edited', '.claude/rules/c.md', 'user edit', 'original'),
      ]);
      const ctx = detectProjectContext(dir);
      assert.equal(ctx.manifestPresent, true);
      assert.equal(ctx.installed, 3);
      assert.deepEqual(ctx.health, {
        'up-to-date': 1,
        outdated: 0,
        drifted: 1,
        orphaned: 0,
        missing: 1,
      });
    });
  });

  it('should count orphans only when the catalog ids are supplied', () => {
    withTempDir(dir => {
      install(dir, [entry(dir, 'old/thing', '.claude/rules/o.md', 'x')]);
      assert.equal(detectProjectContext(dir).health.orphaned, 0);
      const withCatalog = detectProjectContext(dir, { catalogIds: new Set(['some/other']) });
      assert.equal(withCatalog.health.orphaned, 1);
    });
  });

  it('should keep going and say so when the manifest cannot be read', () => {
    withTempDir(dir => {
      touch(dir, '.sigil/manifest.json', '{ not json');
      const ctx = detectProjectContext(dir);
      assert.equal(ctx.installed, 0);
      assert.match(ctx.manifestError ?? '', /manifest/i);
    });
  });
});

describe('recommendNext', () => {
  const first = (ctx: ProjectContext) => recommendNext(ctx)[0];

  it('should suggest a different folder first when run in the home folder', () => {
    const top = first(context({ isHomeDir: true }));
    assert.equal(top?.action, 'change-folder');
    assert.match(top?.reason ?? '', /home/i);
  });

  it('should suggest a different folder first inside a catalog checkout', () => {
    const top = first(context({ isCatalogCheckout: true }));
    assert.equal(top?.action, 'change-folder');
    assert.match(top?.reason ?? '', /catalog/i);
  });

  it('should suggest setting up the project when no target folder exists', () => {
    const top = first(context({ detectedTargets: [], manifestPresent: false, installed: 0 }));
    assert.equal(top?.action, 'init');
  });

  it('should mention that the folder has no project files yet', () => {
    const top = first(
      context({
        detectedTargets: [],
        manifestPresent: false,
        installed: 0,
        looksLikeProject: false,
      }),
    );
    assert.match(top?.reason ?? '', /no project files/i);
  });

  it('should suggest installing when a target exists but nothing is installed', () => {
    assert.equal(first(context({ manifestPresent: false, installed: 0 }))?.action, 'install');
  });

  it('should order problems: restore missing, review drift, update outdated, prune orphans', () => {
    const health = { 'up-to-date': 0, outdated: 1, drifted: 1, orphaned: 1, missing: 1 };
    const actions = recommendNext(context({ installed: 4, health })).map(r => r.action);
    assert.deepEqual(actions, ['restore', 'status', 'update', 'prune']);
  });

  it('should suggest nothing when everything is installed and healthy', () => {
    assert.deepEqual(recommendNext(context()), []);
  });
});
