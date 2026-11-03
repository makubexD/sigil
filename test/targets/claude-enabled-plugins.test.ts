/**
 * Tests for the Claude Code enabled-plugin reader (src/targets/claude-code/enabled-plugins.ts):
 * which marketplace plugins `enabledPlugins` turns on, from the highest settings scope that sets
 * each key. Every read goes through safe-read, so a symlinked or unparseable file is reported and
 * skipped rather than followed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readClaudeEnabledPlugins } from '../../dist-cli/targets/claude-code/enabled-plugins';
import { ClaudeCodeTarget } from '../../dist-cli/targets';

/** A temporary project and home, removed after the test. */
function tempDirs(): { projectDir: string; homeDir: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-enabled-plugins-'));
  const projectDir = path.join(root, 'project');
  const homeDir = path.join(root, 'home');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  return { projectDir, homeDir, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/** Writes `content` (JSON when not a string) to `file`, creating its directory. */
function writeFile(file: string, content: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}

const projectSettings = (dir: string) => path.join(dir, '.claude', 'settings.json');
const localSettings = (dir: string) => path.join(dir, '.claude', 'settings.local.json');
const userSettings = (dir: string) => path.join(dir, '.claude', 'settings.json');

describe('readClaudeEnabledPlugins', () => {
  it('(a) a project-level true enables the plugin from the project settings file', () => {
    const { projectDir, homeDir, cleanup } = tempDirs();
    try {
      writeFile(projectSettings(projectDir), { enabledPlugins: { 'a@sigil': true } });
      assert.deepEqual(readClaudeEnabledPlugins({ projectDir, homeDir, marketplace: 'sigil' }), {
        plugins: [{ name: 'a', source: '.claude/settings.json' }],
        warnings: [],
      });
    } finally {
      cleanup();
    }
  });

  it('(b) a local false beats a user true', () => {
    const { projectDir, homeDir, cleanup } = tempDirs();
    try {
      writeFile(userSettings(homeDir), { enabledPlugins: { 'a@sigil': true } });
      writeFile(localSettings(projectDir), { enabledPlugins: { 'a@sigil': false } });
      assert.deepEqual(
        readClaudeEnabledPlugins({ projectDir, homeDir, marketplace: 'sigil' }).plugins,
        [],
      );
    } finally {
      cleanup();
    }
  });

  it('(c) a project true beats a user false', () => {
    const { projectDir, homeDir, cleanup } = tempDirs();
    try {
      writeFile(userSettings(homeDir), { enabledPlugins: { 'a@sigil': false } });
      writeFile(projectSettings(projectDir), { enabledPlugins: { 'a@sigil': true } });
      assert.deepEqual(
        readClaudeEnabledPlugins({ projectDir, homeDir, marketplace: 'sigil' }).plugins,
        [{ name: 'a', source: '.claude/settings.json' }],
      );
    } finally {
      cleanup();
    }
  });

  it('(d) a plugin from another marketplace is ignored', () => {
    const { projectDir, homeDir, cleanup } = tempDirs();
    try {
      writeFile(projectSettings(projectDir), { enabledPlugins: { 'b@other': true } });
      assert.deepEqual(
        readClaudeEnabledPlugins({ projectDir, homeDir, marketplace: 'sigil' }).plugins,
        [],
      );
    } finally {
      cleanup();
    }
  });

  it('(e) no settings files is empty, with no warnings and no throw', () => {
    const { projectDir, homeDir, cleanup } = tempDirs();
    try {
      assert.deepEqual(readClaudeEnabledPlugins({ projectDir, homeDir, marketplace: 'sigil' }), {
        plugins: [],
        warnings: [],
      });
    } finally {
      cleanup();
    }
  });

  it('(f) an unparseable project file warns once and the user scope is still read', () => {
    const { projectDir, homeDir, cleanup } = tempDirs();
    try {
      writeFile(projectSettings(projectDir), 'not json{');
      writeFile(userSettings(homeDir), { enabledPlugins: { 'a@sigil': true } });
      const result = readClaudeEnabledPlugins({ projectDir, homeDir, marketplace: 'sigil' });
      assert.deepEqual(result.plugins, [{ name: 'a', source: '~/.claude/settings.json' }]);
      assert.equal(result.warnings.length, 1);
      assert.ok(result.warnings[0]!.includes('.claude/settings.json'), result.warnings[0]);
    } finally {
      cleanup();
    }
  });

  it('(g) an enabledPlugins value that is not an object is skipped without a throw', () => {
    const { projectDir, homeDir, cleanup } = tempDirs();
    try {
      writeFile(projectSettings(projectDir), { enabledPlugins: ['a@sigil'] });
      assert.deepEqual(readClaudeEnabledPlugins({ projectDir, homeDir, marketplace: 'sigil' }), {
        plugins: [],
        warnings: [],
      });
    } finally {
      cleanup();
    }
  });

  it('(h) only keys for the requested marketplace are counted', () => {
    const { projectDir, homeDir, cleanup } = tempDirs();
    try {
      writeFile(projectSettings(projectDir), {
        enabledPlugins: { 'a@acme': true, 'a@sigil': true },
      });
      assert.deepEqual(
        readClaudeEnabledPlugins({ projectDir, homeDir, marketplace: 'acme' }).plugins,
        [{ name: 'a', source: '.claude/settings.json' }],
      );
      assert.deepEqual(
        readClaudeEnabledPlugins({ projectDir, homeDir, marketplace: 'other' }).plugins,
        [],
      );
    } finally {
      cleanup();
    }
  });

  it('(i) a symlinked settings file is refused with one warning', () => {
    const { projectDir, homeDir, cleanup } = tempDirs();
    try {
      const real = path.join(projectDir, 'real-settings.json');
      writeFile(real, { enabledPlugins: { 'a@sigil': true } });
      fs.mkdirSync(path.join(projectDir, '.claude'), { recursive: true });
      fs.symlinkSync(real, projectSettings(projectDir));
      const result = readClaudeEnabledPlugins({ projectDir, homeDir, marketplace: 'sigil' });
      assert.deepEqual(result.plugins, []);
      assert.equal(result.warnings.length, 1);
      assert.ok(result.warnings[0]!.includes('.claude/settings.json'), result.warnings[0]);
    } finally {
      cleanup();
    }
  });

  it('(j) the target method returns what the reader returns', () => {
    const { projectDir, homeDir, cleanup } = tempDirs();
    try {
      writeFile(projectSettings(projectDir), { enabledPlugins: { 'a@sigil': true } });
      const target = new ClaudeCodeTarget();
      assert.equal(typeof target.enabledPlugins, 'function');
      assert.deepEqual(
        target.enabledPlugins!({ projectDir, homeDir, marketplace: 'sigil' }),
        readClaudeEnabledPlugins({ projectDir, homeDir, marketplace: 'sigil' }),
      );
    } finally {
      cleanup();
    }
  });
});
