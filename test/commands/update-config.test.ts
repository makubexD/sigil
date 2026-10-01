/**
 * Tests for src/commands/update-config.ts — config-kind (hook/settings/mcp) restore-or-re-merge
 * logic for `sigil update`. Covers the F14 fix (docs/decisions/catalog-usage-audit-2026-08-21.md):
 * a fragment that's entirely MISSING from an existing file must restore without --force, while one
 * whose values were MODIFIED must still require it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyConfigEntry, updateConfigEntry } from '../../dist-cli/commands/update-config';
import type { ManifestEntry } from '../../dist-cli/manifest/types';
import type { ConfigMergeOp } from '../../dist-cli/types';
import type { UpdateOptions } from '../../dist-cli/commands/update';
import { withTempDir } from '../helpers/temp-dir';

function makeOpts(projectDir: string, overrides: Partial<UpdateOptions> = {}): UpdateOptions {
  return {
    projectDir,
    catalogDir: '/fake/catalog',
    packs: '/fake/packs.yaml',
    force: false,
    dryRun: false,
    ...overrides,
  };
}

function makeHookEntry(): ManifestEntry {
  return {
    id: 'shared/protect-config',
    kind: 'hook',
    target: 'claude',
    sigilVersion: '0.1.0',
    files: [],
    configFiles: [
      {
        file: '.claude/settings.json',
        fragment: {
          hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'x' }] }] },
        },
        strategy: { hooks: 'array-append' },
        fragmentSha256: 'irrelevant-for-this-test',
      },
    ],
    dependentOf: [],
    installedAt: new Date().toISOString(),
  };
}

/** An object-spread field (unlike array-append/union) CAN be genuinely overwritten — the real
 *  "modified" case, distinct from the hook fixture above which can only ever be "missing". */
function makeSettingsEntry(): ManifestEntry {
  return {
    id: 'shared/pin-model',
    kind: 'settings',
    target: 'claude',
    sigilVersion: '0.1.0',
    files: [],
    configFiles: [
      {
        file: '.claude/settings.json',
        fragment: { model: 'claude-opus-4-8' },
        strategy: {},
        fragmentSha256: 'irrelevant-for-this-test',
      },
    ],
    dependentOf: [],
    installedAt: new Date().toISOString(),
  };
}

/** The catalog's current ops, taken as identical to what the entry recorded. */
function opsOf(entry: ManifestEntry): ConfigMergeOp[] {
  return (entry.configFiles ?? []).map(cf => ({
    file: cf.file,
    root: cf.root as ConfigMergeOp['root'],
    fragment: cf.fragment,
    strategy: cf.strategy as ConfigMergeOp['strategy'],
  }));
}

describe('updateConfigEntry — F14 missing-vs-modified repair', () => {
  it('restores a fragment entirely missing from an existing file WITHOUT --force', () => {
    withTempDir(dir => {
      const settingsPath = path.join(dir, '.claude', 'settings.json');
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      // The exact F14 shape: permissions (untouched, user's) present; hooks (sigil's) entirely gone.
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({ permissions: { allow: ['Bash(npm run *)'] } }, null, 2),
      );

      const wrote = updateConfigEntry(
        makeHookEntry(),
        makeOpts(dir, { force: false }),
        opsOf(makeHookEntry()),
      );

      assert.ok(wrote, 'missing fragment should be restored without --force');
      const after = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      assert.deepEqual(after.permissions, { allow: ['Bash(npm run *)'] }, 'user content untouched');
      assert.ok(after.hooks?.PreToolUse?.length === 1, 'sigil hook fragment restored');
    });
  });

  it('does NOT overwrite a fragment whose values were changed, without --force', () => {
    withTempDir(dir => {
      const settingsPath = path.join(dir, '.claude', 'settings.json');
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify({ model: 'claude-sonnet-4-6' }, null, 2)); // user changed it

      const wrote = updateConfigEntry(
        makeSettingsEntry(),
        makeOpts(dir, { force: false }),
        opsOf(makeSettingsEntry()),
      );

      assert.equal(wrote, false, 'modified fragment must not be overwritten without --force');
      const after = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      assert.equal(after.model, 'claude-sonnet-4-6', "user's edit preserved");
    });
  });

  it('counts a modified fragment as skipped, so the guided update can offer to overwrite it', () => {
    withTempDir(dir => {
      const settingsPath = path.join(dir, '.claude', 'settings.json');
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify({ model: 'claude-sonnet-4-6' }, null, 2));
      const entry = makeSettingsEntry();

      const kept = applyConfigEntry(entry, makeOpts(dir, { force: false }), opsOf(entry));
      assert.deepEqual(kept, { wrote: false, skipped: 1 });

      const forced = applyConfigEntry(entry, makeOpts(dir, { force: true }), opsOf(entry));
      assert.deepEqual(forced, { wrote: true, skipped: 0 });
    });
  });

  it('does not count a restored (missing) fragment as skipped', () => {
    withTempDir(dir => {
      const settingsPath = path.join(dir, '.claude', 'settings.json');
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify({ permissions: {} }, null, 2));
      const entry = makeHookEntry();
      const result = applyConfigEntry(entry, makeOpts(dir), opsOf(entry));
      assert.deepEqual(result, { wrote: true, skipped: 0 });
    });
  });

  it('DOES overwrite a modified fragment when --force is passed', () => {
    withTempDir(dir => {
      const settingsPath = path.join(dir, '.claude', 'settings.json');
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify({ model: 'claude-sonnet-4-6' }, null, 2));

      const wrote = updateConfigEntry(
        makeSettingsEntry(),
        makeOpts(dir, { force: true }),
        opsOf(makeSettingsEntry()),
      );

      assert.ok(wrote, '--force should re-merge a modified fragment');
      const after = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      assert.equal(after.model, 'claude-opus-4-8', '--force restores sigil value');
    });
  });
});

describe('updateConfigEntry — home-scoped writes take a .sigil.bak (F23)', () => {
  it('writes .sigil.bak before restoring a missing fragment in a home-rooted file', () => {
    withTempDir(dir => {
      // os.homedir() reads USERPROFILE (win32) / HOME (posix) — redirect it at the fixture's
      // own root so the 'home' ConfigRoot resolves inside the temp dir, not the real home dir.
      const homeVar = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';
      const prevHome = process.env[homeVar];
      process.env[homeVar] = dir;
      try {
        const settingsPath = path.join(dir, '.claude.json');
        fs.writeFileSync(settingsPath, JSON.stringify({ someUserKey: true }, null, 2));

        const entry = makeSettingsEntry();
        const cf = entry.configFiles![0]!;
        cf.root = 'home';
        cf.file = '.claude.json';

        const wrote = updateConfigEntry(entry, makeOpts(dir, { force: false }), opsOf(entry));

        assert.ok(wrote, 'missing fragment restored');
        assert.ok(
          fs.existsSync(`${settingsPath}.sigil.bak`),
          'a .sigil.bak was written before the home-scoped file was overwritten',
        );
        const backup = JSON.parse(fs.readFileSync(`${settingsPath}.sigil.bak`, 'utf-8'));
        assert.deepEqual(backup, { someUserKey: true }, 'backup captures pre-write content');
      } finally {
        if (prevHome === undefined) delete process.env[homeVar];
        else process.env[homeVar] = prevHome;
      }
    });
  });
});

describe('updateConfigEntry — the committed manifest is not trusted for content', () => {
  const settingsPath = (dir: string) => path.join(dir, '.claude', 'settings.json');
  const writeSettings = (dir: string, value: unknown) => {
    fs.mkdirSync(path.dirname(settingsPath(dir)), { recursive: true });
    fs.writeFileSync(settingsPath(dir), JSON.stringify(value, null, 2));
  };

  it('does not restore a recorded fragment the catalog has no op for', () => {
    withTempDir(dir => {
      writeSettings(dir, { permissions: { allow: [] } });

      const wrote = updateConfigEntry(makeHookEntry(), makeOpts(dir), []);

      assert.equal(wrote, false);
      assert.equal(fs.readFileSync(settingsPath(dir), 'utf-8').includes('hooks'), false);
    });
  });

  it("restores the catalog's fragment, not an edited manifest copy", () => {
    withTempDir(dir => {
      writeSettings(dir, {});
      const catalogOps = opsOf(makeHookEntry());
      const tampered = makeHookEntry();
      const hook = (tampered.configFiles![0]!.fragment as any).hooks.PreToolUse[0].hooks[0];
      hook.command = 'evil';

      updateConfigEntry(tampered, makeOpts(dir), catalogOps);

      const text = fs.readFileSync(settingsPath(dir), 'utf-8');
      assert.equal(text.includes('evil'), false, text);
      assert.match(text, /"command": "x"/);
    });
  });
});
