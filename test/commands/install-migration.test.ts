/**
 * Existing installs keep working. `test/fixtures/installs/master-8882c86/` holds a project that the
 * CLI at commit 8882c86 set up (the representative selection in `helpers/install-scenario.ts`, over
 * the user's own config files). It is frozen: never regenerate it, because it stands for what users
 * already have on disk. Each test runs the current CLI over a copy and checks that `status`, `update`
 * and `prune` treat it as before: nothing reported broken, edited files protected, config fragments
 * replaced instead of stacked, a second update a no-op, and an updated install identical to a fresh one.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runStatus } from '../../dist-cli/commands/status';
import { runPrune } from '../../dist-cli/commands/prune';
import { canonicalize } from '../../dist-cli/config-merge';
import { loadManifest, saveManifest, sha256 } from '../../dist-cli/manifest';
import { withTempDirAsync } from '../helpers/temp-dir';
import { hashTree, treeDiff } from '../helpers/output-tree';
import {
  CATALOG,
  FULL_SELECTION,
  PACKS,
  TARGETS,
  add,
  seedUserConfig,
  update,
} from '../helpers/install-scenario';

const FROZEN = path.resolve(__dirname, '../../test/fixtures/installs/master-8882c86');
const USER_EDIT = '\n<!-- the user wrote this line -->\n';
const STALE_HASH = '0'.repeat(64);
const SETTINGS = '.claude/settings.json';
const HOOK_ID = 'shared/protect-config';
const CURRENT_MATCHER = 'Edit|Write';
const OLDER_MATCHER = 'Edit';
const JSON_INDENT = 2;
const EDITED_FILE: Record<string, string> = {
  claude: '.claude/rules/shared-cli-rules.md',
  copilot: '.github/instructions/shared-cli-rules.instructions.md',
};

/** Copies the frozen install for `target` into `dir`. */
function restoreFrozen(dir: string, target: string): void {
  fs.cpSync(path.join(FROZEN, target), dir, { recursive: true });
}

/** Runs `fn` with console.log captured, and returns the captured text parsed as JSON. */
async function captureJson<T>(fn: () => Promise<void>): Promise<T> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return JSON.parse(lines.join('\n')) as T;
}

/**
 * Makes the manifest record an older hash for `relPath`, as it looks after the catalog changed that
 * file. Without this, update sees fresh content equal to the record and never weighs the user's edit.
 */
function markRecordedHashStale(dir: string, relPath: string): void {
  const manifest = loadManifest(dir);
  const file = manifest.entries.flatMap(e => e.files).find(f => f.path === relPath);
  assert.ok(file, `${relPath} is not in the frozen manifest`);
  file.sha256 = STALE_HASH;
  saveManifest(dir, manifest);
}

interface HookItem {
  matcher: string;
}

/**
 * Makes the Claude install look as if an older catalog had written the protect-config hook: the
 * same older matcher in the manifest's recorded fragment and in `.claude/settings.json`. Update then
 * sees a catalog change and must replace that hook, not append a second one.
 */
function simulateOlderHook(dir: string): void {
  const manifest = loadManifest(dir);
  const merge = manifest.entries.find(e => e.id === HOOK_ID)?.configFiles?.[0];
  assert.ok(merge, `${HOOK_ID} has no config record in the frozen manifest`);
  const recorded = (merge.fragment.hooks as Record<string, HookItem[]>).PreToolUse!;
  recorded[0]!.matcher = OLDER_MATCHER;
  merge.fragmentSha256 = sha256(canonicalize(merge.fragment));
  saveManifest(dir, manifest);
  const settings = readJson(dir, SETTINGS);
  const onDisk = (settings.hooks as Record<string, HookItem[]>).PreToolUse!;
  onDisk.find(item => item.matcher === CURRENT_MATCHER)!.matcher = OLDER_MATCHER;
  fs.writeFileSync(path.join(dir, SETTINGS), JSON.stringify(settings, null, JSON_INDENT) + '\n');
}

function readJson(dir: string, rel: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8')) as Record<string, unknown>;
}

const options = (dir: string, target: string) => ({
  projectDir: dir,
  target,
  catalogDir: CATALOG,
  packs: PACKS,
});

for (const target of TARGETS) {
  describe(`frozen ${target} install from master 8882c86`, () => {
    it('should report every installed artifact as healthy', async () => {
      await withTempDirAsync(async dir => {
        restoreFrozen(dir, target);
        const statuses = await captureJson<{ id: string; status: string }[]>(() =>
          runStatus({ ...options(dir, target), json: true }),
        );
        assert.deepEqual(
          statuses.filter(s => s.status !== 'up-to-date' && s.status !== 'outdated'),
          [],
        );
      });
    });

    it('should bring an unedited install to exactly what a fresh install writes', async () => {
      await withTempDirAsync(async dir => {
        const fresh = path.join(dir, 'fresh');
        const old = path.join(dir, 'old');
        seedUserConfig(fresh);
        await add(fresh, target, FULL_SELECTION);
        restoreFrozen(old, target);
        await update(old, target);
        assert.deepEqual(treeDiff(hashTree(fresh), hashTree(old)), []);
      });
    });

    it('should keep a file the user edited when the catalog has a newer version', async () => {
      await withTempDirAsync(async dir => {
        restoreFrozen(dir, target);
        markRecordedHashStale(dir, EDITED_FILE[target]!);
        const edited = path.join(dir, EDITED_FILE[target]!);
        fs.appendFileSync(edited, USER_EDIT);
        await update(dir, target);
        assert.ok(fs.readFileSync(edited, 'utf8').endsWith(USER_EDIT));
      });
    });

    it('should change nothing on a second update', async () => {
      await withTempDirAsync(async dir => {
        restoreFrozen(dir, target);
        await update(dir, target);
        const once = hashTree(dir);
        await update(dir, target);
        assert.deepEqual(treeDiff(once, hashTree(dir)), []);
      });
    });

    it("should keep the user's own config next to sigil's after update", async () => {
      await withTempDirAsync(async dir => {
        restoreFrozen(dir, target);
        await update(dir, target);
        const mcpFile = target === 'claude' ? '.mcp.json' : '.vscode/mcp.json';
        const serversKey = target === 'claude' ? 'mcpServers' : 'servers';
        const servers = readJson(dir, mcpFile)[serversKey] as Record<string, unknown>;
        assert.deepEqual(Object.keys(servers).sort(), ['filesystem', 'user-server']);
        assert.equal(readJson(dir, '.claude/settings.json').model, 'user-choice');
      });
    });

    if (target === 'claude') {
      it('should replace a hook the catalog changed instead of adding a second copy', async () => {
        await withTempDirAsync(async dir => {
          restoreFrozen(dir, target);
          const before = hashTree(dir);
          simulateOlderHook(dir);
          await update(dir, target);
          assert.deepEqual(treeDiff(before, hashTree(dir)), []);
        });
      });
    }

    it('should find nothing to prune', async () => {
      await withTempDirAsync(async dir => {
        restoreFrozen(dir, target);
        const before = loadManifest(dir).entries.length;
        const report = await captureJson<{ orphaned: unknown[]; deprecated: unknown[] }>(() =>
          runPrune({ ...options(dir, target), apply: true, yes: true, force: false, json: true }),
        );
        assert.deepEqual(report.orphaned, []);
        assert.deepEqual(report.deprecated, []);
        assert.equal(loadManifest(dir).entries.length, before);
      });
    });
  });
}
