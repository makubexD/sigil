/**
 * Tests for the Claude Code enabled-plugin reader (src/targets/claude-code/enabled-plugins.ts):
 * which marketplace plugins `enabledPlugins` turns on, from the highest settings scope that sets
 * each key. Every read goes through safe-read; an unparseable file is reported and skipped, and a
 * symlink is refused except for a user-scope settings file, which is read at its target.
 *
 * Every read passes `vars` and a temp `systemDir` explicitly so neither the real environment nor
 * the real managed policy directory is ever read.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readClaudeEnabledPlugins } from '../../dist-cli/targets/claude-code/enabled-plugins';
import { ClaudeCodeTarget } from '../../dist-cli/targets';

type Vars = Readonly<Record<string, string | undefined>>;

/** A temporary project and home, removed after the test. */
function tempDirs(): { projectDir: string; homeDir: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-enabled-plugins-'));
  const projectDir = path.join(root, 'project');
  const homeDir = path.join(root, 'home');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  return { projectDir, homeDir, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/** Runs `fn` with a fresh temp project and home, cleaned up afterwards. */
function withDirs(fn: (projectDir: string, homeDir: string) => void): void {
  const { projectDir, homeDir, cleanup } = tempDirs();
  try {
    fn(projectDir, homeDir);
  } finally {
    cleanup();
  }
}

/** Writes `content` (JSON when not a string) to `file`, creating its directory. */
function writeFile(file: string, content: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}

/** Reads from the temp dirs with an explicit marketplace and `vars`, and a temp managed dir. */
function readFrom(projectDir: string, homeDir: string, marketplace: string, vars: Vars = {}) {
  return readClaudeEnabledPlugins({
    projectDir,
    homeDir,
    marketplace,
    vars,
    systemDir: managedDir(projectDir),
  });
}

/** Reads from the temp dirs with the `sigil` marketplace and explicit `vars`. */
function read(projectDir: string, homeDir: string, vars: Vars = {}) {
  return readFrom(projectDir, homeDir, 'sigil', vars);
}

/** Creates a file symlink, or reports that this machine cannot (Windows without privilege). */
function linkFile(target: string, link: string): boolean {
  try {
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link);
    return true;
  } catch {
    return false;
  }
}

const projectSettings = (dir: string) => path.join(dir, '.claude', 'settings.json');
const localSettings = (dir: string) => path.join(dir, '.claude', 'settings.local.json');
const userSettings = (dir: string) => path.join(dir, '.claude', 'settings.json');

/** The managed-settings directory for a test: a sibling of the temp project, absent by default. */
const managedDir = (projectDir: string) => path.join(path.dirname(projectDir), 'managed');

describe('readClaudeEnabledPlugins', () => {
  it('(a) a project-level true enables the plugin from the project settings file', () => {
    withDirs((projectDir, homeDir) => {
      writeFile(projectSettings(projectDir), { enabledPlugins: { 'a@sigil': true } });
      assert.deepEqual(read(projectDir, homeDir), {
        plugins: [{ name: 'a', source: '.claude/settings.json' }],
        warnings: [],
      });
    });
  });

  it('(b) a local false beats a user true', () => {
    withDirs((projectDir, homeDir) => {
      writeFile(userSettings(homeDir), { enabledPlugins: { 'a@sigil': true } });
      writeFile(localSettings(projectDir), { enabledPlugins: { 'a@sigil': false } });
      assert.deepEqual(read(projectDir, homeDir).plugins, []);
    });
  });

  it('(c) a project true beats a user false', () => {
    withDirs((projectDir, homeDir) => {
      writeFile(userSettings(homeDir), { enabledPlugins: { 'a@sigil': false } });
      writeFile(projectSettings(projectDir), { enabledPlugins: { 'a@sigil': true } });
      assert.deepEqual(read(projectDir, homeDir).plugins, [
        { name: 'a', source: '.claude/settings.json' },
      ]);
    });
  });

  it('(d) a plugin from another marketplace is ignored', () => {
    withDirs((projectDir, homeDir) => {
      writeFile(projectSettings(projectDir), { enabledPlugins: { 'b@other': true } });
      assert.deepEqual(read(projectDir, homeDir).plugins, []);
    });
  });

  it('(e) no settings files is empty, with no warnings and no throw', () => {
    withDirs((projectDir, homeDir) => {
      assert.deepEqual(read(projectDir, homeDir), { plugins: [], warnings: [] });
    });
  });

  it('(f) an unparseable project file warns once and the user scope is still read', () => {
    withDirs((projectDir, homeDir) => {
      writeFile(projectSettings(projectDir), 'not json{');
      writeFile(userSettings(homeDir), { enabledPlugins: { 'a@sigil': true } });
      const result = read(projectDir, homeDir);
      assert.deepEqual(result.plugins, [{ name: 'a', source: '~/.claude/settings.json' }]);
      assert.equal(result.warnings.length, 1);
      assert.ok(result.warnings[0]!.includes('.claude/settings.json'), result.warnings[0]);
    });
  });

  it('(g) an enabledPlugins value that is not an object is skipped without a throw', () => {
    withDirs((projectDir, homeDir) => {
      writeFile(projectSettings(projectDir), { enabledPlugins: ['a@sigil'] });
      assert.deepEqual(read(projectDir, homeDir), { plugins: [], warnings: [] });
    });
  });

  it('(h) only keys for the requested marketplace are counted', () => {
    withDirs((projectDir, homeDir) => {
      writeFile(projectSettings(projectDir), {
        enabledPlugins: { 'a@acme': true, 'a@sigil': true },
      });
      assert.deepEqual(readFrom(projectDir, homeDir, 'acme').plugins, [
        { name: 'a', source: '.claude/settings.json' },
      ]);
      assert.deepEqual(readFrom(projectDir, homeDir, 'other').plugins, []);
    });
  });

  it('(i) a symlinked project settings file is refused with one warning', t => {
    withDirs((projectDir, homeDir) => {
      const real = path.join(projectDir, 'real-settings.json');
      writeFile(real, { enabledPlugins: { 'a@sigil': true } });
      if (!linkFile(real, projectSettings(projectDir))) {
        return t.skip('this machine cannot create symbolic links');
      }
      const result = read(projectDir, homeDir);
      assert.deepEqual(result.plugins, []);
      assert.equal(result.warnings.length, 1);
      assert.ok(result.warnings[0]!.includes('.claude/settings.json'), result.warnings[0]);
    });
  });

  it('(j) the target method returns what the reader returns', () => {
    withDirs((projectDir, homeDir) => {
      writeFile(projectSettings(projectDir), { enabledPlugins: { 'a@sigil': true } });
      const target = new ClaudeCodeTarget();
      assert.equal(typeof target.enabledPlugins, 'function');
      assert.deepEqual(
        target.enabledPlugins!({
          projectDir,
          homeDir,
          marketplace: 'sigil',
          vars: {},
          systemDir: managedDir(projectDir),
        }),
        read(projectDir, homeDir),
      );
    });
  });

  it('(k) a project .claude that is a file warns once and the user scope is still read', () => {
    withDirs((projectDir, homeDir) => {
      fs.writeFileSync(path.join(projectDir, '.claude'), 'not a directory');
      writeFile(userSettings(homeDir), { enabledPlugins: { 'a@sigil': true } });
      const result = read(projectDir, homeDir);
      assert.deepEqual(result.plugins, [{ name: 'a', source: '~/.claude/settings.json' }]);
      assert.equal(result.warnings.length, 1);
      assert.ok(result.warnings[0]!.includes('.claude/settings'), result.warnings[0]);
    });
  });

  it('(l) a missing settings file is skipped without a warning', () => {
    withDirs((projectDir, homeDir) => {
      fs.mkdirSync(path.join(projectDir, '.claude'));
      writeFile(userSettings(homeDir), { enabledPlugins: { 'a@sigil': true } });
      const result = read(projectDir, homeDir);
      assert.deepEqual(result.plugins, [{ name: 'a', source: '~/.claude/settings.json' }]);
      assert.deepEqual(result.warnings, []);
    });
  });
});

describe('CLAUDE_CONFIG_DIR and a symlinked user settings file', () => {
  it('(a) CLAUDE_CONFIG_DIR moves the user scope and the home file is ignored', () => {
    withDirs((projectDir, homeDir) => {
      const cfgDir = path.join(projectDir, 'cfg');
      const cfgFile = path.join(cfgDir, 'settings.json');
      writeFile(cfgFile, { enabledPlugins: { 'a@sigil': true } });
      writeFile(userSettings(homeDir), { enabledPlugins: { 'b@sigil': true } });
      assert.deepEqual(read(projectDir, homeDir, { CLAUDE_CONFIG_DIR: cfgDir }).plugins, [
        { name: 'a', source: cfgFile },
      ]);
    });
  });

  it('(b) an empty CLAUDE_CONFIG_DIR reads the home file', () => {
    withDirs((projectDir, homeDir) => {
      writeFile(userSettings(homeDir), { enabledPlugins: { 'a@sigil': true } });
      assert.deepEqual(read(projectDir, homeDir, { CLAUDE_CONFIG_DIR: '' }).plugins, [
        { name: 'a', source: '~/.claude/settings.json' },
      ]);
    });
  });

  it('(c) a symlinked user settings file is followed with no warning', t => {
    withDirs((projectDir, homeDir) => {
      const real = path.join(projectDir, 'real-settings.json');
      writeFile(real, { enabledPlugins: { 'a@sigil': true } });
      if (!linkFile(real, userSettings(homeDir))) {
        return t.skip('this machine cannot create symbolic links');
      }
      const result = read(projectDir, homeDir);
      assert.deepEqual(result.plugins, [{ name: 'a', source: '~/.claude/settings.json' }]);
      assert.deepEqual(result.warnings, []);
    });
  });

  it('(d) a broken user symlink is one warning, and other scopes still read', t => {
    withDirs((projectDir, homeDir) => {
      if (!linkFile(path.join(projectDir, 'missing.json'), userSettings(homeDir))) {
        return t.skip('this machine cannot create symbolic links');
      }
      writeFile(projectSettings(projectDir), { enabledPlugins: { 'a@sigil': true } });
      const result = read(projectDir, homeDir);
      assert.deepEqual(result.plugins, [{ name: 'a', source: '.claude/settings.json' }]);
      assert.equal(result.warnings.length, 1);
      assert.ok(result.warnings[0]!.includes('~/.claude/settings.json'), result.warnings[0]);
    });
  });

  it('(e) a symlinked project settings file is still refused', t => {
    withDirs((projectDir, homeDir) => {
      const real = path.join(projectDir, 'real-settings.json');
      writeFile(real, { enabledPlugins: { 'a@sigil': true } });
      if (!linkFile(real, projectSettings(projectDir))) {
        return t.skip('this machine cannot create symbolic links');
      }
      const result = read(projectDir, homeDir);
      assert.deepEqual(result.plugins, []);
      assert.equal(result.warnings.length, 1);
      assert.ok(result.warnings[0]!.includes('.claude/settings.json'), result.warnings[0]);
    });
  });
});

describe('file-based managed settings', () => {
  const managedSettings = (projectDir: string) =>
    path.join(managedDir(projectDir), 'managed-settings.json');
  const dropIn = (projectDir: string, name: string) =>
    path.join(managedDir(projectDir), 'managed-settings.d', name);

  it('(a) a managed true is counted over a local false, naming the managed file', () => {
    withDirs((projectDir, homeDir) => {
      const file = managedSettings(projectDir);
      writeFile(file, { enabledPlugins: { 'a@sigil': true } });
      writeFile(localSettings(projectDir), { enabledPlugins: { 'a@sigil': false } });
      assert.deepEqual(read(projectDir, homeDir), {
        plugins: [{ name: 'a', source: `managed settings (${file})` }],
        warnings: [],
      });
    });
  });

  it('(b) a managed false beats a project true', () => {
    withDirs((projectDir, homeDir) => {
      writeFile(managedSettings(projectDir), { enabledPlugins: { 'a@sigil': false } });
      writeFile(projectSettings(projectDir), { enabledPlugins: { 'a@sigil': true } });
      assert.deepEqual(read(projectDir, homeDir), { plugins: [], warnings: [] });
    });
  });

  it('(c) a later drop-in wins over an earlier one and the base file', () => {
    withDirs((projectDir, homeDir) => {
      const base = managedSettings(projectDir);
      const first = dropIn(projectDir, '10-a.json');
      const second = dropIn(projectDir, '20-b.json');
      writeFile(base, { enabledPlugins: { 'a@sigil': true, 'b@sigil': true } });
      writeFile(first, { enabledPlugins: { 'a@sigil': false, 'c@sigil': true } });
      writeFile(second, { enabledPlugins: { 'a@sigil': true } });
      assert.deepEqual(read(projectDir, homeDir).plugins, [
        { name: 'a', source: `managed settings (${second})` },
        { name: 'b', source: `managed settings (${base})` },
        { name: 'c', source: `managed settings (${first})` },
      ]);
    });
  });

  it('(d) a hidden drop-in is ignored', () => {
    withDirs((projectDir, homeDir) => {
      writeFile(dropIn(projectDir, '.hidden.json'), { enabledPlugins: { 'a@sigil': true } });
      assert.deepEqual(read(projectDir, homeDir), { plugins: [], warnings: [] });
    });
  });

  it('(e) invalid JSON is one warning, and other drop-ins and scopes still apply', () => {
    withDirs((projectDir, homeDir) => {
      const good = dropIn(projectDir, '20-good.json');
      writeFile(dropIn(projectDir, '10-bad.json'), 'not json{');
      writeFile(good, { enabledPlugins: { 'a@sigil': true } });
      writeFile(projectSettings(projectDir), { enabledPlugins: { 'b@sigil': true } });
      const result = read(projectDir, homeDir);
      assert.deepEqual(result.plugins, [
        { name: 'a', source: `managed settings (${good})` },
        { name: 'b', source: '.claude/settings.json' },
      ]);
      assert.equal(result.warnings.length, 1);
      assert.ok(result.warnings[0]!.includes('10-bad.json'), result.warnings[0]);
    });
  });

  it('(f) no managed directory is silent', () => {
    withDirs((projectDir, homeDir) => {
      writeFile(projectSettings(projectDir), { enabledPlugins: { 'a@sigil': true } });
      assert.deepEqual(read(projectDir, homeDir).warnings, []);
    });
  });
});
