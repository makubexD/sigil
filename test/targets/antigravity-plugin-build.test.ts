/**
 * The Antigravity plugin build: `compile()` writes `plugins/<name>/` folders over the real catalog
 * and `packs.yaml` — one plugin per pack with its skills, agents and rules, plus one generated
 * plugin per hook and MCP artifact (docs/plan-antigravity-target-f.md steps 6 and 7).
 *
 * The real build holds no rule file, because every language rule is scoped and the scoped-rule
 * `skipReason` leaves it out; the rule-trigger case therefore adds a fixture pack over the real
 * catalog so the always-on rule actually reaches a plugin. The empty-pack and collision cases use
 * fixture packs too, so each names exactly what it holds.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { SigilError } from '../../dist-cli/errors';
import { parseFrontmatter } from '../../dist-cli/frontmatter-parse';
import { parsePacksConfig } from '../../dist-cli/packs-config';
import { getTarget } from '../../dist-cli/targets/index';
import { appliesToEveryFile } from '../../dist-cli/targets/shared/repo-wide-rules';
import type { CompileOptions, FileMap, Pack } from '../../dist-cli/types';
import { loadResolvedCatalog } from '../helpers/catalog';
import { PACKS as BUNDLED_PACKS } from '../helpers/install-scenario';

const TARGET = 'antigravity';
const ROOT = path.resolve(__dirname, '../..');
const VERSION = (
  JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { version: string }
).version;
const EXCLUDED_PROMPT = 'shared/author-artifact';
const PROTECT_CONFIG = 'shared/protect-config';

/** The real `packs.yaml`, parsed — the build's pack membership. */
function realPacks(): Pack[] {
  return parsePacksConfig(fs.readFileSync(BUNDLED_PACKS, 'utf8'), BUNDLED_PACKS).packs;
}

/** Compile the real catalog with the real packs, plus any fixture packs. */
async function compileWith(...fixtures: Pack[]): Promise<FileMap> {
  const catalog = await loadResolvedCatalog();
  const options: CompileOptions = { version: VERSION, packs: [...realPacks(), ...fixtures] };
  return getTarget(TARGET).compile(catalog, options);
}

/** A pack made of explicit catalog ids. */
function packOf(name: string, artifacts: string[]): Pack {
  return { name, displayName: name, description: `The ${name} pack.`, artifacts };
}

/** The plugin folder a built path belongs to: `plugins/<name>/…` → `<name>`. */
function pluginNameOf(file: string): string {
  return file.split('/')[1]!;
}

/** Every key `pattern` matches, with its match groups. */
function matching(files: FileMap, pattern: RegExp): { file: string; match: RegExpMatchArray }[] {
  return Object.keys(files).flatMap(file => {
    const match = file.match(pattern);
    return match ? [{ file, match }] : [];
  });
}

describe('Antigravity plugin build', () => {
  it('should write every file inside a plugins/<name>/ folder', async () => {
    const files = await compileWith();
    const keys = Object.keys(files);

    assert.ok(keys.length > 0, 'the build writes files');
    assert.ok(
      keys.every(file => /^plugins\/[^/]+\//.test(file)),
      `every path is plugin-scoped: ${keys.find(file => !/^plugins\/[^/]+\//.test(file))}`,
    );
    assert.ok(
      !keys.some(file => file.startsWith('.agents/') || file === 'AGENTS.md'),
      'no scaffold path',
    );
  });

  it('should give every plugin a manifest naming its folder at the package version', async () => {
    const files = await compileWith();
    const dirs = [...new Set(Object.keys(files).map(pluginNameOf))];

    assert.ok(dirs.length > 0, 'the build writes plugin folders');
    for (const dir of dirs) {
      const manifest = files[`plugins/${dir}/plugin.json`];
      assert.ok(manifest, `${dir} has a plugin.json`);
      const json = JSON.parse(manifest) as { name: string; version: string };
      assert.equal(json.name, dir, `${dir} manifest names its folder`);
      assert.equal(json.version, VERSION, `${dir} manifest version is pkg.version`);
    }
  });

  it('should name every skill folder after its frontmatter name', async () => {
    const files = await compileWith();
    const skills = matching(files, /^plugins\/[^/]+\/skills\/([^/]+)\/SKILL\.md$/);

    assert.ok(skills.length > 0, 'the build wrote plugin skills');
    for (const { file, match } of skills) {
      const data = parseFrontmatter(files[file]!).data as { name?: unknown };
      assert.equal(data.name, match[1], `${file} frontmatter name matches its folder`);
    }
  });

  it('should write every agent tools field as a YAML list, never a string', async () => {
    const files = await compileWith();
    const agents = matching(files, /^plugins\/[^/]+\/agents\/[^/]+\.md$/);

    assert.ok(agents.length > 0, 'the build wrote plugin agents');
    const withTools = agents.filter(
      ({ file }) =>
        (parseFrontmatter(files[file]!).data as { tools?: unknown }).tools !== undefined,
    );
    assert.ok(withTools.length > 0, 'some plugin agent declares tools');
    for (const { file } of withTools) {
      const data = parseFrontmatter(files[file]!).data as { tools?: unknown };
      assert.ok(Array.isArray(data.tools), `${file} tools is a YAML list`);
      assert.ok((data.tools as unknown[]).length > 0, `${file} tools is not empty`);
      assert.ok(
        (data.tools as unknown[]).every(tool => typeof tool === 'string'),
        `${file} tools holds strings`,
      );
    }
  });

  it('should write only repo-wide rules, always with trigger: always_on', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await compileWith(
      packOf('rule-fixture', ['shared/clean-code', 'shared/cli-rules']),
    );
    const rules = matching(files, /^plugins\/[^/]+\/rules\/[^/]+\.md$/);

    assert.ok(rules.length > 0, 'the fixture pack wrote a rule file');
    for (const { file } of rules) {
      const data = parseFrontmatter(files[file]!).data as { trigger?: unknown };
      assert.equal(data.trigger, 'always_on', `${file} is always on`);
    }

    const scoped = catalog.artifacts.filter(
      artifact =>
        artifact.kind === 'rule' &&
        !appliesToEveryFile(artifact.frontmatter.appliesTo as readonly string[] | undefined),
    );
    assert.ok(scoped.length > 0, 'the catalog has scoped rules');
    for (const rule of scoped) {
      const name = `${rule.id.replace(/\//g, '-')}.md`;
      assert.ok(
        !Object.keys(files).some(file => file.endsWith(`/rules/${name}`)),
        `scoped rule ${rule.id} is not written`,
      );
    }
  });

  it('should write no file from a prompt or workflow artifact', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await compileWith();
    const keys = Object.keys(files);

    assert.ok(
      keys.some(file => /^plugins\/[^/]+\/skills\//.test(file)),
      'the build wrote plugin files',
    );

    const prompts = catalog.artifacts.filter(artifact => artifact.kind === 'prompt');
    assert.ok(prompts.length > 0, 'the catalog has prompt artifacts');
    for (const prompt of prompts) {
      const name = prompt.id.split('/').at(-1)!;
      assert.ok(
        !keys.some(file => file.includes(`/${name}/`) || file.endsWith(`/${name}.md`)),
        `no file for prompt ${prompt.id}`,
      );
    }
    assert.ok(
      !keys.some(file => /\/workflows?\//.test(file) || file.endsWith('.workflow.md')),
      'no workflow file',
    );
  });

  it('should leave a pluginExclude artifact out of every plugin', async () => {
    const files = await compileWith();
    const keys = Object.keys(files);
    const excluded = EXCLUDED_PROMPT.split('/').at(-1)!;

    assert.ok(
      keys.some(file => /^plugins\/[^/]+\/plugin\.json$/.test(file)),
      'the build wrote plugin folders',
    );
    assert.ok(
      !keys.some(file => file.includes(excluded)),
      `${EXCLUDED_PROMPT} appears in no plugin`,
    );
  });

  it('should ship hooks and MCP servers only as their own generated plugins', async () => {
    const files = await compileWith();
    const keys = Object.keys(files);

    assert.ok(
      'plugins/hook-protect-config/hooks.json' in files,
      'hook-protect-config ships hooks.json',
    );

    const configFiles = keys.filter(file => /\/hooks\.json$|\/mcp_config\.json$/.test(file));
    assert.ok(configFiles.length > 0, 'the build wrote config plugins');
    for (const file of configFiles) {
      assert.match(pluginNameOf(file), /^(hook|mcp)-/, `${file} belongs to a generated plugin`);
    }

    const packDirs = new Set(
      keys.filter(file => /^plugins\/[^/]+\/(skills|agents|rules)\//.test(file)).map(pluginNameOf),
    );
    assert.ok(packDirs.size > 0, 'the build wrote pack plugins');
    for (const dir of packDirs) {
      assert.ok(!(`plugins/${dir}/hooks.json` in files), `${dir} carries no hooks.json`);
      assert.ok(!(`plugins/${dir}/mcp_config.json` in files), `${dir} carries no mcp_config.json`);
    }
  });

  it('should write no pack plugin for a pack holding only a hook', async () => {
    const files = await compileWith(packOf('hook-only-pack', [PROTECT_CONFIG]));

    assert.ok(
      'plugins/hook-protect-config/hooks.json' in files,
      'the hook still gets its generated plugin',
    );
    assert.ok(
      !Object.keys(files).some(file => file.startsWith('plugins/hook-only-pack/')),
      'no plugin folder for the hook-only pack',
    );
  });

  it('should fail the build when a pack collides with a generated plugin name', async () => {
    const catalog = await loadResolvedCatalog();

    await assert.rejects(
      getTarget(TARGET).compile(catalog, {
        version: VERSION,
        packs: [...realPacks(), packOf('hook-protect-config', ['typescript/ts-document'])],
      }),
      (error: unknown) => {
        assert.ok(error instanceof SigilError, 'rejects with a SigilError');
        assert.ok(
          error.message.includes('hook-protect-config'),
          'the message names the colliding plugin',
        );
        return true;
      },
    );
  });
});
