/**
 * Consumer overlays end to end, on every target that scaffolds rules: `add` writes the narrowed
 * scope, the file reads up to date, `update` re-applies a changed overlay and widens back when it is
 * removed, and a refused entry skips only its own rule. (docs/decisions/consumer-overlays-2026-10.md)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runAdd } from '../../dist-cli/commands/add';
import { runUpdate } from '../../dist-cli/commands/update';
import { computeStatus, loadManifest } from '../../dist-cli/manifest';
import { OVERLAYS_FILE } from '../../dist-cli/overlays';
import { getAllTargets } from '../../dist-cli/targets/index';
import { installableKinds } from '../../dist-cli/targets/capabilities';
import { CATALOG, PACKS } from '../helpers/install-scenario';
import { withTempDirAsync } from '../helpers/temp-dir';

const SCOPED = { id: 'typescript/ts-code-quality', globs: ['**/*.ts', '**/*.tsx'] };
const REPO_WIDE = { id: 'shared/git', globs: ['**/*'] };
const TARGETS = getAllTargets()
  .filter(t => installableKinds(t).includes('rule'))
  .map(t => t.name);

function writeOverlays(dir: string, rules: Record<string, string[]>): void {
  const lines = Object.entries(rules).map(([id, scope]) => `  ${id}:\n    scope: [${scope}]`);
  fs.mkdirSync(path.join(dir, '.sigil'), { recursive: true });
  fs.writeFileSync(path.join(dir, OVERLAYS_FILE), `rules:\n${lines.join('\n')}\n`);
}

async function add(dir: string, target: string, ids: string[]): Promise<void> {
  await runAdd(
    ids.map(id => `rule:${id}`),
    {
      projectDir: dir,
      catalogDir: CATALOG,
      packs: PACKS,
      target,
      deps: false,
      dryRun: false,
      interactive: false,
      yes: true,
      overwrite: false,
      settingsLocal: false,
    },
  );
}

async function update(dir: string, target: string): Promise<void> {
  await runUpdate([], {
    projectDir: dir,
    catalogDir: CATALOG,
    packs: PACKS,
    target,
    force: false,
    dryRun: false,
    yes: true,
  });
}

/** The globs in the frontmatter of `id`'s installed file, sorted; undefined when not installed. */
function scope(dir: string, target: string, id: string): string[] | undefined {
  const entry = loadManifest(dir).entries.find(e => e.id === id && e.target === target);
  const file = entry?.files[0]?.path;
  if (file === undefined) return undefined;
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(
    fs.readFileSync(path.join(dir, file), 'utf8'),
  );
  return (frontmatter?.[1]?.match(/[^\s"',]*\*\*[^\s"',]*/g) ?? []).sort();
}

/** `globs` under each prefix, sorted the way {@link scope} returns them. */
function under(prefixes: string[], globs: string[]): string[] {
  return prefixes.flatMap(p => globs.map(g => `${p}/${g}`)).sort();
}

function statuses(dir: string): string[] {
  const manifest = loadManifest(dir);
  const known = new Set(manifest.entries.map(e => e.id));
  return computeStatus(manifest, dir, known).map(s => `${s.entry.id} ${s.status}`);
}

for (const target of TARGETS) {
  describe(`consumer overlays on ${target}`, () => {
    it('should install a scoped and a repo-wide rule narrowed, and read them up to date', async () => {
      await withTempDirAsync(async dir => {
        writeOverlays(dir, { [SCOPED.id]: ['src', 'packages/api'], [REPO_WIDE.id]: ['src'] });
        await add(dir, target, [SCOPED.id, REPO_WIDE.id]);
        assert.deepEqual(
          scope(dir, target, SCOPED.id),
          under(['src', 'packages/api'], SCOPED.globs),
        );
        assert.deepEqual(scope(dir, target, REPO_WIDE.id), under(['src'], REPO_WIDE.globs));
        assert.deepEqual(statuses(dir), [`${SCOPED.id} up-to-date`, `${REPO_WIDE.id} up-to-date`]);
      });
    });

    it('should re-apply a changed overlay on update, and widen back when it is removed', async () => {
      await withTempDirAsync(async dir => {
        writeOverlays(dir, { [SCOPED.id]: ['src'] });
        await add(dir, target, [SCOPED.id]);
        writeOverlays(dir, { [SCOPED.id]: ['lib'] });
        await update(dir, target);
        assert.deepEqual(scope(dir, target, SCOPED.id), under(['lib'], SCOPED.globs));
        assert.deepEqual(statuses(dir), [`${SCOPED.id} up-to-date`]);
        fs.rmSync(path.join(dir, OVERLAYS_FILE));
        await update(dir, target);
        assert.deepEqual(scope(dir, target, SCOPED.id), [...SCOPED.globs].sort());
      });
    });

    it('should skip only the rule whose overlay is refused, on add and on update', async () => {
      await withTempDirAsync(async dir => {
        writeOverlays(dir, { [SCOPED.id]: ['src'], [REPO_WIDE.id]: ['../x'] });
        await add(dir, target, [SCOPED.id, REPO_WIDE.id]);
        assert.deepEqual(scope(dir, target, SCOPED.id), under(['src'], SCOPED.globs));
        assert.equal(scope(dir, target, REPO_WIDE.id), undefined);

        writeOverlays(dir, { [SCOPED.id]: ['src'], [REPO_WIDE.id]: ['src'] });
        await add(dir, target, [REPO_WIDE.id]);
        writeOverlays(dir, { [SCOPED.id]: ['lib'], [REPO_WIDE.id]: ['src/*'] });
        await update(dir, target);
        assert.deepEqual(scope(dir, target, SCOPED.id), under(['lib'], SCOPED.globs));
        assert.deepEqual(scope(dir, target, REPO_WIDE.id), under(['src'], REPO_WIDE.globs));
      });
    });
  });
}
