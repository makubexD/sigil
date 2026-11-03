/**
 * Tests for the Antigravity enabled-plugin reader (src/targets/antigravity/enabled-plugins.ts):
 * a plugin is installed when a regular folder under `.agents/plugins/` (workspace) or
 * `~/.gemini/config/plugins/` holds a root `plugin.json` naming it and no `.claude-plugin/`, and
 * `~/.gemini/config/config.json` does not mark it `enabled: false` (decision 8,
 * docs/plan-complement-follow-ups.md).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readAntigravityEnabledPlugins } from '../../dist-cli/targets/antigravity/enabled-plugins';
import type { EnabledPluginsEnv } from '../../dist-cli/types';
import { formatPluginOverlap, pluginOverlaps } from '../../dist-cli/plugin-overlap';
import { parsePacksConfig } from '../../dist-cli/packs-config';
import { getTarget } from '../../dist-cli/targets/index';
import { loadResolvedCatalog } from '../helpers/catalog';
import { PACKS } from '../helpers/install-scenario';

/** A temporary home, removed after the test. */
function tempHome(): { homeDir: string; cleanup: () => void } {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-antigravity-plugins-'));
  return { homeDir, cleanup: () => fs.rmSync(homeDir, { recursive: true, force: true }) };
}

/** The workspace plugin folder of `projectDir`. */
const workspacePath = (projectDir: string) => path.join(projectDir, '.agents', 'plugins');

/** The user plugin folder of `homeDir`. */
const userPath = (homeDir: string) => path.join(homeDir, '.gemini', 'config', 'plugins');

/** Writes a plugin folder's root `plugin.json`. */
function installPlugin(dir: string, name: string, manifest: unknown = { name }): void {
  const folder = path.join(dir, name);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'plugin.json'), JSON.stringify(manifest));
}

/** Writes the user `config.json`. */
function writeConfig(homeDir: string, text: string): void {
  const dir = path.join(homeDir, '.gemini', 'config');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), text);
}

/** The reader environment; the home is both the project and the user scope by default. */
function env(projectDir: string, homeDir: string): EnabledPluginsEnv {
  return { projectDir, homeDir, marketplace: 'sigil' };
}

describe('readAntigravityEnabledPlugins', () => {
  it('(a) a user-scope folder with a matching plugin.json is counted', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      installPlugin(userPath(homeDir), 'alpha');
      assert.deepEqual(readAntigravityEnabledPlugins(env(homeDir, homeDir)), {
        plugins: [{ name: 'alpha', source: '~/.gemini/config/plugins/alpha' }],
        warnings: [],
        marketplace: false,
      });
    } finally {
      cleanup();
    }
  });

  it('(b) the same name in both scopes keeps the workspace source', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      installPlugin(userPath(homeDir), 'alpha');
      installPlugin(workspacePath(homeDir), 'alpha');
      assert.deepEqual(readAntigravityEnabledPlugins(env(homeDir, homeDir)), {
        plugins: [{ name: 'alpha', source: '.agents/plugins/alpha' }],
        warnings: [],
        marketplace: false,
      });
    } finally {
      cleanup();
    }
  });

  it('(c) a folder holding .claude-plugin is an import copy and is not counted', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      const folder = path.join(userPath(homeDir), 'alpha');
      installPlugin(userPath(homeDir), 'alpha');
      fs.mkdirSync(path.join(folder, '.claude-plugin'));
      assert.deepEqual(readAntigravityEnabledPlugins(env(homeDir, homeDir)), {
        plugins: [],
        warnings: [],
        marketplace: false,
      });
    } finally {
      cleanup();
    }
  });

  it('(d) a plugin.json naming a different folder is not counted', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      installPlugin(userPath(homeDir), 'alpha', { name: 'beta' });
      assert.deepEqual(readAntigravityEnabledPlugins(env(homeDir, homeDir)), {
        plugins: [],
        warnings: [],
        marketplace: false,
      });
    } finally {
      cleanup();
    }
  });

  it('(e) an invalid plugin.json is one warning, and the other plugins are counted', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      installPlugin(userPath(homeDir), 'alpha');
      const folder = path.join(userPath(homeDir), 'beta');
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, 'plugin.json'), '{"name": ');

      const result = readAntigravityEnabledPlugins(env(homeDir, homeDir));

      assert.equal(result.warnings.length, 1);
      assert.match(result.warnings[0] ?? '', /^~\/\.gemini\/config\/plugins\/beta\/plugin\.json: /);
      assert.deepEqual(
        result.plugins.map(plugin => plugin.name),
        ['alpha'],
      );
    } finally {
      cleanup();
    }
  });

  it('(f) only an explicit enabled = false in config.json drops a plugin', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      installPlugin(userPath(homeDir), 'alpha');

      writeConfig(homeDir, JSON.stringify({ plugins: { alpha: { enabled: false } } }));
      assert.deepEqual(readAntigravityEnabledPlugins(env(homeDir, homeDir)).plugins, []);

      writeConfig(homeDir, JSON.stringify({ plugins: { alpha: { enabled: true } } }));
      assert.deepEqual(
        readAntigravityEnabledPlugins(env(homeDir, homeDir)).plugins.map(plugin => plugin.name),
        ['alpha'],
      );

      writeConfig(homeDir, JSON.stringify({ plugins: { other: { enabled: false } } }));
      assert.deepEqual(
        readAntigravityEnabledPlugins(env(homeDir, homeDir)).plugins.map(plugin => plugin.name),
        ['alpha'],
      );

      writeConfig(homeDir, '{"plugins": ');
      const invalid = readAntigravityEnabledPlugins(env(homeDir, homeDir));
      assert.equal(invalid.warnings.length, 1);
      assert.match(invalid.warnings[0] ?? '', /^~\/\.gemini\/config\/config\.json: /);
      assert.deepEqual(
        invalid.plugins.map(plugin => plugin.name),
        ['alpha'],
      );
    } finally {
      cleanup();
    }
  });

  it('(g) through pluginOverlaps, typescript-starter yields its skill and agent ids, with no @', async () => {
    const { homeDir, cleanup } = tempHome();
    try {
      installPlugin(userPath(homeDir), 'typescript-starter');

      const catalog = await loadResolvedCatalog();
      const packs = parsePacksConfig(fs.readFileSync(PACKS, 'utf8'), PACKS).packs;
      const { overlaps } = pluginOverlaps(
        getTarget('antigravity'),
        catalog,
        packs,
        env(homeDir, homeDir),
      );

      for (const id of [
        'typescript/ts-document',
        'typescript/ts-generate-tests',
        'typescript/ts-release',
        'typescript/ts-code-reviewer',
      ]) {
        assert.ok(overlaps.has(id), `${id} is delivered by the plugin`);
      }
      assert.equal(catalog.byId.get('typescript/ts-code-reviewer')?.kind, 'agent');

      for (const [id, overlap] of overlaps) {
        const kind = catalog.byId.get(id)?.kind;
        assert.ok(kind === 'skill' || kind === 'agent', `${id} is a skill or agent`);
        assert.equal(overlap.marketplace, undefined);
        assert.ok(!formatPluginOverlap(id, overlap).includes('@'), `${id} names no marketplace`);
      }
    } finally {
      cleanup();
    }
  });
});
