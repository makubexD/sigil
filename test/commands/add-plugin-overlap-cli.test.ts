/**
 * `sigil add --complement` at the CLI boundary: the flag is wired in `src/cli.ts` and the command
 * reads the plugin state from the home `os.homedir()` resolves to. Every spawn gets a temp `HOME`,
 * so the real `~/.claude/settings.json` is never read; the pack plugin and skill it enables come
 * from `getTarget('claude').marketplacePluginContents`, the same contents the build writes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getTarget } from '../../dist-cli/targets';
import { resolveCatalog } from '../../dist-cli/resolve';
import { parsePacksConfig } from '../../dist-cli/packs-config';
import { loadBundledCatalog } from '../helpers/catalog';
import { makeTempDir } from '../helpers/temp-dir';

const PACKS = path.resolve(__dirname, '../../packs.yaml');
const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const HOME_VAR = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';

/** One spawned CLI run: its exit code and stdout plus stderr. */
interface Run {
  status: number | null;
  output: string;
}

/** Runs the built CLI in `project` with `home` as the user home. */
function sigil(home: string, project: string, args: readonly string[]): Run {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: project,
    encoding: 'utf8',
    env: { ...process.env, [HOME_VAR]: home },
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** Enables `plugin` at user scope in `home`, the way Claude Code records it. */
function enablePlugin(home: string, plugin: string): void {
  const dir = path.join(home, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'settings.json'),
    JSON.stringify({ enabledPlugins: { [`${plugin}@sigil`]: true } }, null, 2),
  );
}

/** The first pack plugin in marketplace order that delivers a skill, and where that skill lands. */
async function pickPluginSkill(): Promise<{ plugin: string; skill: string; skillFile: string }> {
  const catalog = resolveCatalog(await loadBundledCatalog());
  const packs = parsePacksConfig(fs.readFileSync(PACKS, 'utf8'), PACKS).packs;
  const contents = getTarget('claude').marketplacePluginContents?.(catalog, packs);
  assert.ok(contents, 'the claude target reads the plugin contents it builds');
  for (const [plugin, ids] of contents) {
    for (const id of ids) {
      const artifact = catalog.byId.get(id);
      if (artifact?.kind !== 'skill') continue;
      const name = artifact.frontmatter.name as string;
      return { plugin, skill: id, skillFile: path.join('.claude/skills', name, 'SKILL.md') };
    }
  }
  throw new Error('no marketplace plugin delivers a skill');
}

/** A fresh project and home under one temp root, removed when the body returns. */
async function withDirs(
  fn: (dirs: { project: string; home: string }) => Promise<void>,
): Promise<void> {
  const work = makeTempDir();
  try {
    const project = path.join(work, 'project');
    const home = path.join(work, 'home');
    fs.mkdirSync(project);
    fs.mkdirSync(home);
    await fn({ project, home });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

describe('sigil add --complement (CLI)', () => {
  it('should install the skill and warn when an enabled plugin also delivers it', async () => {
    const { plugin, skill, skillFile } = await pickPluginSkill();
    await withDirs(async ({ project, home }) => {
      enablePlugin(home, plugin);

      const run = sigil(home, project, [
        'add',
        skill,
        '--target',
        'claude',
        '--project-dir',
        project,
        '--yes',
      ]);

      assert.equal(run.status, 0, run.output);
      assert.ok(fs.existsSync(path.join(project, skillFile)));
      assert.match(run.output, new RegExp(`${plugin}@sigil`));
      assert.match(run.output, /~\/\.claude\/settings\.json/);
    });
  });

  it('should skip the skill under --complement and name the plugin', async () => {
    const { plugin, skill, skillFile } = await pickPluginSkill();
    await withDirs(async ({ project, home }) => {
      enablePlugin(home, plugin);

      const run = sigil(home, project, [
        'add',
        skill,
        '--target',
        'claude',
        '--project-dir',
        project,
        '--yes',
        '--complement',
      ]);

      assert.equal(run.status, 0, run.output);
      assert.ok(!fs.existsSync(path.join(project, skillFile)));
      assert.match(run.output, new RegExp(`delivered by plugin ${plugin}@sigil`));
    });
  });

  it('should show the skip on --complement --dry-run and write nothing', async () => {
    const { plugin, skill } = await pickPluginSkill();
    await withDirs(async ({ project, home }) => {
      enablePlugin(home, plugin);

      const run = sigil(home, project, [
        'add',
        skill,
        '--target',
        'claude',
        '--project-dir',
        project,
        '--yes',
        '--complement',
        '--dry-run',
      ]);

      assert.equal(run.status, 0, run.output);
      assert.match(run.output, new RegExp(`delivered by plugin ${plugin}@sigil`));
      assert.ok(!fs.existsSync(path.join(project, '.claude')));
    });
  });

  it('should list --complement in add --help', async () => {
    await withDirs(async ({ project, home }) => {
      const run = sigil(home, project, ['add', '--help']);

      assert.equal(run.status, 0, run.output);
      assert.match(run.output, /--complement/);
    });
  });
});
