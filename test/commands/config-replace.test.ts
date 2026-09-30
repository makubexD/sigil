/**
 * A config fragment sigil already installed is *replaced*, never stacked: re-running `sigil add`
 * for the same hook must not append a second copy (hooks merge with `array-append`), and
 * `sigil update` must swap a fragment the catalog has since changed for the new one. Found by the
 * 2026-09-27 install audit: the fixed `shared/protect-config` hook could not reach an existing
 * install, and the dead one would have stayed beside it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { withTempDir } from '../helpers/temp-dir';

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const HOOK = 'hook:shared/protect-config';
const SETTINGS = '.claude/settings.json';

function sigil(cwd: string, ...args: string[]): string {
  return execFileSync(process.execPath, [CLI, ...args, '--project-dir', cwd], {
    cwd,
    encoding: 'utf-8',
  });
}

type HookGroups = { matcher: string; hooks: { command: string; args?: string[] }[] }[];
const preToolUse = (dir: string): HookGroups =>
  JSON.parse(fs.readFileSync(path.join(dir, SETTINGS), 'utf8')).hooks.PreToolUse;

/** Rewrites the install as if an older catalog had written `oldCommand` for this hook. */
function simulateOldInstall(dir: string, oldCommand: string): void {
  const settingsPath = path.join(dir, SETTINGS);
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const oldGroup = {
    matcher: 'Edit|Write|MultiEdit',
    hooks: [{ type: 'command', command: oldCommand }],
  };
  settings.hooks.PreToolUse = [
    { matcher: 'Bash', hooks: [{ type: 'command', command: 'mine' }] },
    oldGroup,
  ];
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  const manifestPath = path.join(dir, '.sigil', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const entry = manifest.entries.find((e: { id: string }) => e.id === 'shared/protect-config');
  entry.configFiles[0].fragment = { hooks: { PreToolUse: [oldGroup] } };
  entry.configFiles[0].fragmentSha256 = 'old';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

const SETTINGS_ART = 'settings:shared/allow-dev-tools';

type Record_ = {
  file: string;
  fragment: Record<string, unknown>;
  strategy: Record<string, string>;
};
const manifestPath = (dir: string) => path.join(dir, '.sigil', 'manifest.json');
const readManifest = (dir: string) => JSON.parse(fs.readFileSync(manifestPath(dir), 'utf8'));

function editJson(file: string, edit: (o: Record<string, unknown>) => void): void {
  const o = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(o);
  fs.writeFileSync(file, JSON.stringify(o, null, 2));
}

/** Edits the first recorded config fragment of `id` in the manifest. */
function editRecord(dir: string, id: string, edit: (cf: Record_) => void): void {
  editJson(manifestPath(dir), m => {
    const entries = m.entries as { id: string; configFiles: Record_[] }[];
    edit(entries.find(e => e.id === id)!.configFiles[0]!);
  });
}

describe('config fragments are replaced, not stacked', () => {
  it('re-running add for the same hook leaves exactly one copy', () => {
    withTempDir(dir => {
      sigil(dir, 'add', HOOK, '--target', 'claude', '--scope', 'project', '--yes');
      sigil(dir, 'add', HOOK, '--target', 'claude', '--scope', 'project', '--yes', '--overwrite');
      assert.equal(preToolUse(dir).length, 1);
    });
  });

  it('update swaps a hook the catalog changed, keeping the user’s own hooks', () => {
    withTempDir(dir => {
      sigil(dir, 'add', HOOK, '--target', 'claude', '--scope', 'project', '--yes');
      const current = preToolUse(dir)[0]!;
      simulateOldInstall(dir, 'node -e "old"');

      sigil(dir, 'update', '--target', 'claude');

      const groups = preToolUse(dir);
      assert.equal(groups.length, 2, JSON.stringify(groups));
      assert.equal(groups[0]!.hooks[0]!.command, 'mine', 'user hook kept');
      assert.deepEqual(groups[1], current, 'old sigil hook replaced by the catalog one');
    });
  });

  it('update replaces a fragment whose top-level keys changed', () => {
    withTempDir(dir => {
      sigil(dir, 'add', SETTINGS_ART, '--target', 'claude', '--scope', 'project', '--yes');
      editJson(path.join(dir, SETTINGS), s => (s.env = { OLD: '1' }));
      editRecord(dir, 'shared/allow-dev-tools', cf => {
        cf.fragment = { ...cf.fragment, env: { OLD: '1' } };
        cf.strategy = { ...cf.strategy, env: 'object-spread' };
      });

      sigil(dir, 'update', '--target', 'claude');

      const settings = JSON.parse(fs.readFileSync(path.join(dir, SETTINGS), 'utf8'));
      assert.equal(settings.env?.OLD, undefined, JSON.stringify(settings));
      assert.ok(settings.permissions.allow.includes('Bash(npm run *)'));
    });
  });

  it('update refuses a recorded config path outside its root', () => {
    withTempDir(dir => {
      sigil(dir, 'add', HOOK, '--target', 'claude', '--scope', 'project', '--yes');
      const escaped = path.join(dir, '..', `escaped-${path.basename(dir)}.json`);
      editRecord(dir, 'shared/protect-config', cf => (cf.file = path.relative(dir, escaped)));

      try {
        // Refused twice over: no catalog op has that path, and resolveContained would throw.
        sigil(dir, 'update', '--target', 'claude');
        assert.equal(fs.existsSync(escaped), false);
      } finally {
        fs.rmSync(escaped, { force: true });
      }
    });
  });

  it('uninstall refuses a recorded config path outside its root', () => {
    withTempDir(dir => {
      sigil(dir, 'add', HOOK, '--target', 'claude', '--scope', 'project', '--yes');
      const escaped = path.join(dir, '..', `escaped-u-${path.basename(dir)}.json`);
      fs.writeFileSync(escaped, '{"keep": true}');
      editRecord(dir, 'shared/protect-config', cf => (cf.file = path.relative(dir, escaped)));

      try {
        assert.throws(() => sigil(dir, 'uninstall', 'shared/protect-config', '--yes'), /outside/);
        assert.equal(fs.readFileSync(escaped, 'utf8'), '{"keep": true}');
      } finally {
        fs.rmSync(escaped, { force: true });
      }
    });
  });

  it('update never writes a recorded fragment the catalog does not have', () => {
    withTempDir(dir => {
      sigil(dir, 'add', HOOK, '--target', 'claude', '--scope', 'project', '--yes');
      const pwned = { PreToolUse: [{ hooks: [{ type: 'command', command: 'echo pwned' }] }] };
      editRecord(dir, 'shared/protect-config', cf => {
        cf.file = '.claude/elsewhere.json';
        cf.fragment = { hooks: pwned };
      });

      const out = sigil(dir, 'update', '--target', 'claude');

      assert.equal(fs.existsSync(path.join(dir, '.claude/elsewhere.json')), false);
      assert.match(out, /not in the current catalog/);
    });
  });

  it('add does not record a fragment it could not write', () => {
    withTempDir(dir => {
      sigil(dir, 'add', HOOK, '--target', 'claude', '--scope', 'project', '--yes');
      editRecord(dir, 'shared/protect-config', cf => (cf.fragment = { hooks: { old: [] } }));
      fs.writeFileSync(path.join(dir, SETTINGS), '{ not json');

      sigil(dir, 'add', HOOK, '--target', 'claude', '--scope', 'project', '--yes', '--overwrite');

      const manifest = readManifest(dir);
      const entry = manifest.entries.find((e: { id: string }) => e.id === 'shared/protect-config');
      assert.deepEqual(entry.configFiles[0].fragment, { hooks: { old: [] } });
    });
  });

  it('update leaves a sigil hook the user edited alone without --force', () => {
    withTempDir(dir => {
      sigil(dir, 'add', HOOK, '--target', 'claude', '--scope', 'project', '--yes');
      simulateOldInstall(dir, 'node -e "old"');
      const settingsPath = path.join(dir, SETTINGS);
      const edited = fs.readFileSync(settingsPath, 'utf8').replace('node -e \\"old\\"', 'my edit');
      fs.writeFileSync(settingsPath, edited);

      sigil(dir, 'update', '--target', 'claude');

      assert.ok(
        preToolUse(dir).some(g => g.hooks[0]!.command === 'my edit'),
        'edit kept',
      );
    });
  });
});
