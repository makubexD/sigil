/**
 * Tests for the Copilot CLI enabled-plugin reader (src/targets/copilot/enabled-plugins.ts):
 * one installed plugin per regular folder under `~/.copilot/installed-plugins/<marketplace>/`.
 * A file, another marketplace's folder and a symbolic link are never counted as a plugin.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCopilotEnabledPlugins } from '../../dist-cli/targets/copilot/enabled-plugins';
import { CopilotTarget } from '../../dist-cli/targets';

/** A temporary home, removed after the test. */
function tempHome(): { homeDir: string; cleanup: () => void } {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-copilot-plugins-'));
  return { homeDir, cleanup: () => fs.rmSync(homeDir, { recursive: true, force: true }) };
}

/** The folder Copilot installs marketplace plugins into. */
const installedPlugins = (homeDir: string) => path.join(homeDir, '.copilot', 'installed-plugins');

/** Creates the marketplace folder `sigil` and returns its path. */
function sigilDir(homeDir: string): string {
  const dir = path.join(installedPlugins(homeDir), 'sigil');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const env = (homeDir: string) => ({ projectDir: homeDir, homeDir, marketplace: 'sigil' });

describe('readCopilotEnabledPlugins', () => {
  it('(a) two plugin folders are both found, sorted by name', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      const dir = sigilDir(homeDir);
      fs.mkdirSync(path.join(dir, 'zeta'));
      fs.mkdirSync(path.join(dir, 'alpha'));
      assert.deepEqual(readCopilotEnabledPlugins(env(homeDir)), {
        plugins: [
          { name: 'alpha', source: '~/.copilot/installed-plugins/sigil/alpha' },
          { name: 'zeta', source: '~/.copilot/installed-plugins/sigil/zeta' },
        ],
        warnings: [],
      });
    } finally {
      cleanup();
    }
  });

  it('(b) no ~/.copilot folder is empty, with no warnings and no throw', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      assert.deepEqual(readCopilotEnabledPlugins(env(homeDir)), { plugins: [], warnings: [] });
    } finally {
      cleanup();
    }
  });

  it('(c) a regular file next to a plugin folder is ignored', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      const dir = sigilDir(homeDir);
      fs.mkdirSync(path.join(dir, 'alpha'));
      fs.writeFileSync(path.join(dir, 'NOTES.md'), 'not a plugin');
      assert.deepEqual(readCopilotEnabledPlugins(env(homeDir)).plugins, [
        { name: 'alpha', source: '~/.copilot/installed-plugins/sigil/alpha' },
      ]);
    } finally {
      cleanup();
    }
  });

  it('(d) folders under _direct/ and another marketplace are ignored', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      const dir = sigilDir(homeDir);
      fs.mkdirSync(path.join(dir, 'alpha'));
      fs.mkdirSync(path.join(installedPlugins(homeDir), '_direct', 'beta'), { recursive: true });
      fs.mkdirSync(path.join(installedPlugins(homeDir), 'other', 'gamma'), { recursive: true });
      assert.deepEqual(readCopilotEnabledPlugins(env(homeDir)).plugins, [
        { name: 'alpha', source: '~/.copilot/installed-plugins/sigil/alpha' },
      ]);
    } finally {
      cleanup();
    }
  });

  it('(e) a symlink inside the marketplace folder pointing at a directory is ignored', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      const dir = sigilDir(homeDir);
      fs.mkdirSync(path.join(dir, 'alpha'));
      const real = path.join(homeDir, 'real-plugin');
      fs.mkdirSync(real);
      fs.symlinkSync(real, path.join(dir, 'linked'), 'dir');
      assert.deepEqual(readCopilotEnabledPlugins(env(homeDir)), {
        plugins: [{ name: 'alpha', source: '~/.copilot/installed-plugins/sigil/alpha' }],
        warnings: [],
      });
    } finally {
      cleanup();
    }
  });

  it('(f) a marketplace folder that is itself a symlink is not followed', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      const real = path.join(homeDir, 'real-marketplace');
      fs.mkdirSync(path.join(real, 'alpha'), { recursive: true });
      fs.mkdirSync(installedPlugins(homeDir), { recursive: true });
      fs.symlinkSync(real, path.join(installedPlugins(homeDir), 'sigil'), 'dir');
      assert.deepEqual(readCopilotEnabledPlugins(env(homeDir)), { plugins: [], warnings: [] });
    } finally {
      cleanup();
    }
  });

  it('(g) the target method returns what the reader returns', () => {
    const { homeDir, cleanup } = tempHome();
    try {
      const dir = sigilDir(homeDir);
      fs.mkdirSync(path.join(dir, 'zeta'));
      fs.mkdirSync(path.join(dir, 'alpha'));
      const target = new CopilotTarget();
      assert.equal(typeof target.enabledPlugins, 'function');
      assert.deepEqual(
        target.enabledPlugins!(env(homeDir)),
        readCopilotEnabledPlugins(env(homeDir)),
      );
    } finally {
      cleanup();
    }
  });
});
