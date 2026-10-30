/**
 * Prompts ship as Claude Code plugin skills: inside the plugin folder, user-invoked, with their
 * placeholders translated, and named without the `shared/` prefix (`/essentials:explain-diff`).
 * `sigil add` keeps the full slug, because a scaffolded skill has no namespace.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { parsePacksConfig } from '../../dist-cli/packs-config';
import { resolveCatalog } from '../../dist-cli/resolve';
import { ClaudeCodeTarget } from '../../dist-cli/targets/claude-code';
import { specFor } from '../../dist-cli/targets/emit-files';
import { CLAUDE_EMIT_SPECS } from '../../dist-cli/targets/claude-code/spec';
import { SigilError } from '../../dist-cli/errors';
import type { FileMap, Pack, ResolvedCatalog } from '../../dist-cli/types';
import { loadBundledCatalog } from '../helpers/catalog';
import { PACKS as BUNDLED_PACKS } from '../helpers/install-scenario';

const VERSION = '0.1.0';

/** Compile the bundled catalog with the real `packs.yaml`. */
async function compileBundled(): Promise<{ files: FileMap; resolved: ResolvedCatalog }> {
  const catalog = await loadBundledCatalog();
  const resolved = resolveCatalog(catalog);
  const config = parsePacksConfig(fs.readFileSync(BUNDLED_PACKS, 'utf8'), BUNDLED_PACKS);
  const target = new ClaudeCodeTarget();
  const files = await target.compile(resolved, { version: VERSION, packs: config.packs });
  return { files, resolved };
}

/** Every output path under the pack's plugin folder. */
function pluginKeys(files: FileMap, packName: string): string[] {
  return Object.keys(files).filter(key => key.startsWith(`plugins/${packName}/`));
}

/** The `name` of every marketplace entry, in order. */
function marketplaceNames(files: FileMap): string[] {
  const marketplace = JSON.parse(files['.claude-plugin/marketplace.json']!);
  return marketplace.plugins.map((entry: { name: string }) => entry.name);
}

/** A pack made of explicit catalog ids, so a test names exactly what it holds. */
function packOf(name: string, artifacts: string[]): Pack {
  return { name, displayName: name, description: `The ${name} pack.`, artifacts };
}

/** The resolved catalog with `shared/explain-diff` cloned under `id`, as a prompt. */
function withPrompt(resolved: ResolvedCatalog, id: string): ResolvedCatalog {
  const base = resolved.byId.get('shared/explain-diff');
  assert.ok(base, 'shared/explain-diff is in the bundled catalog');
  const clone = structuredClone(base);
  clone.id = id;
  clone.frontmatter.id = id;
  return {
    ...resolved,
    artifacts: [...resolved.artifacts, clone],
    byId: new Map(resolved.byId).set(id, clone),
  };
}

const EXPLAIN_DIFF = 'plugins/essentials/skills/explain-diff/SKILL.md';
const AUTHOR_ARTIFACT = 'plugins/essentials/skills/author-artifact/SKILL.md';

describe('Claude plugin: prompts as skills', () => {
  it('should land the prompts in the plugin', async () => {
    const { files } = await compileBundled();

    assert.ok(EXPLAIN_DIFF in files, 'explain-diff emitted into the essentials plugin');
    assert.ok(AUTHOR_ARTIFACT in files, 'author-artifact emitted into the essentials plugin');
  });

  it('should drop the shared- prefix from explain-diff', async () => {
    const { files } = await compileBundled();

    const f = files[EXPLAIN_DIFF];
    assert.ok(f, 'explain-diff SKILL.md emitted');
    assert.ok(f.includes('name: explain-diff'), 'name loses the shared- prefix');
  });

  it('should keep explain-diff user-invoked, with args', async () => {
    const { files } = await compileBundled();

    const f = files[EXPLAIN_DIFF];
    assert.ok(f, 'explain-diff SKILL.md emitted');
    assert.ok(f.includes('disable-model-invocation: true'), 'user-invoked only');
    assert.ok(f.includes('argument-hint:'), 'argument-hint line present');
    assert.ok(f.includes('arguments:'), 'arguments list present');
    assert.ok(f.includes('  - diff'), 'diff in arguments list');
    assert.ok(f.includes('  - audience'), 'audience in arguments list');
  });

  it('should translate the placeholders', async () => {
    const { files } = await compileBundled();

    const f = files[EXPLAIN_DIFF];
    assert.ok(f, 'explain-diff SKILL.md emitted');
    assert.ok(f.includes('$diff'), '$diff substitution present');
    assert.ok(!f.includes('{{'), 'no unresolved {{…}} placeholder');
  });

  it('should leak nothing outside the plugins folder', async () => {
    const { files } = await compileBundled();

    assert.ok(
      !Object.keys(files).some(key => key.startsWith('.claude/')),
      'no compiled key starts with .claude/',
    );
    assert.ok(
      !Object.keys(files).some(key => key.includes('shared-explain-diff')),
      'no compiled key keeps the shared-explain-diff name',
    );
  });

  it('should ship only the prompts in the essentials plugin', async () => {
    const { files } = await compileBundled();

    assert.deepEqual(
      pluginKeys(files, 'essentials').sort(),
      ['plugins/essentials/.claude-plugin/plugin.json', EXPLAIN_DIFF, AUTHOR_ARTIFACT].sort(),
      'essentials carries its manifest and its two prompts, nothing else',
    );
  });

  it('should list essentials in the marketplace', async () => {
    const { files } = await compileBundled();

    assert.ok(marketplaceNames(files).includes('essentials'), 'essentials is a marketplace entry');
  });

  it('should leave every other plugin untouched', async () => {
    const { files } = await compileBundled();

    const foreign = Object.keys(files).filter(
      key => key.startsWith('plugins/') && !key.startsWith('plugins/essentials/'),
    );
    assert.ok(
      !foreign.some(key => key.includes('explain-diff') || key.includes('author-artifact')),
      'no other plugin carries the prompts',
    );
  });

  it('should keep the scaffold names unchanged', async () => {
    const { resolved } = await compileBundled();
    const target = new ClaudeCodeTarget();
    const files = await target.scaffold!('shared/explain-diff', resolved, {
      projectDir: '/fake',
    });

    const f = files['.claude/skills/shared-explain-diff/SKILL.md'];
    assert.ok(f, 'scaffold still writes .claude/skills/shared-explain-diff/SKILL.md');
    assert.ok(f.includes('name: shared-explain-diff'), 'scaffold name keeps the shared- prefix');
  });

  it('should have a spec per channel', async () => {
    assert.equal(
      specFor(CLAUDE_EMIT_SPECS, 'prompt', 'plugin')?.variant,
      'plugin',
      'the plugin channel resolves a plugin-variant prompt spec',
    );
    assert.equal(
      specFor(CLAUDE_EMIT_SPECS, 'prompt', 'scaffold')?.variant,
      'scaffold',
      'the scaffold channel resolves a scaffold-variant prompt spec',
    );
  });

  it('should reject a prompt that collides with a skill', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = withPrompt(resolveCatalog(catalog), 'shared/cs-generate-tests');
    const target = new ClaudeCodeTarget();

    await assert.rejects(
      target.compile(resolved, {
        version: VERSION,
        packs: [packOf('collide', ['shared/cs-generate-tests', 'csharp/cs-generate-tests'])],
      }),
      (error: unknown) => {
        assert.ok(error instanceof SigilError, 'rejects with a SigilError');
        assert.match(error.message, /^plugin 'collide':/);
        assert.ok(error.message.includes('shared/cs-generate-tests'), 'names the prompt id');
        assert.ok(error.message.includes('csharp/cs-generate-tests'), 'names the skill id');
        assert.ok(
          error.message.includes('plugins/collide/skills/cs-generate-tests/SKILL.md'),
          'names the colliding path',
        );
        return true;
      },
    );
  });

  it('should accept the same id listed twice', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.compile(resolved, {
      version: VERSION,
      packs: [packOf('twice', ['shared/explain-diff', 'shared/explain-diff'])],
    });

    assert.ok(
      'plugins/twice/skills/explain-diff/SKILL.md' in files,
      'the prompt is emitted once, with no collision error',
    );
  });

  it('should emit a language prompt under its plain basename', async () => {
    const { resolved } = await compileBundled();
    const target = new ClaudeCodeTarget();
    const files = await target.compile(withPrompt(resolved, 'csharp/cs-deploy'), {
      version: VERSION,
      packs: [packOf('lang', ['csharp/cs-deploy'])],
    });

    const f = files['plugins/lang/skills/cs-deploy/SKILL.md'];
    assert.ok(f, 'the language prompt lands under its basename');
    assert.ok(f.includes('name: cs-deploy'), 'name is the plain basename');
  });

  it('should not stutter the language into the plugin slug', async () => {
    const { resolved } = await compileBundled();
    const target = new ClaudeCodeTarget();
    const files = await target.compile(withPrompt(resolved, 'csharp/cs-deploy'), {
      version: VERSION,
      packs: [packOf('lang', ['csharp/cs-deploy'])],
    });

    assert.ok(
      !Object.keys(files).some(key => key.includes('csharp-cs-deploy')),
      'no compiled key keeps the csharp-cs-deploy name',
    );
  });

  it('should reject two prompts that share a basename', async () => {
    const { resolved } = await compileBundled();
    const withBoth = withPrompt(withPrompt(resolved, 'csharp/cs-deploy'), 'shared/cs-deploy');
    const target = new ClaudeCodeTarget();

    await assert.rejects(
      target.compile(withBoth, {
        version: VERSION,
        packs: [packOf('basenames', ['csharp/cs-deploy', 'shared/cs-deploy'])],
      }),
      (error: unknown) => {
        assert.ok(error instanceof SigilError, 'rejects with a SigilError');
        assert.match(error.message, /^plugin 'basenames':/);
        assert.ok(error.message.includes('csharp/cs-deploy'), 'names the language prompt');
        assert.ok(error.message.includes('shared/cs-deploy'), 'names the shared prompt');
        assert.ok(
          error.message.includes('plugins/basenames/skills/cs-deploy/SKILL.md'),
          'names the colliding path',
        );
        return true;
      },
    );
  });

  it('should leave an excluded prompt out of the plugin', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.compile(resolved, {
      version: VERSION,
      packs: [
        {
          ...packOf('exclude', ['shared/explain-diff', 'shared/author-artifact']),
          pluginExclude: ['shared/author-artifact'],
        },
      ],
    });

    assert.deepEqual(
      pluginKeys(files, 'exclude').filter(key => key.includes('/skills/')),
      ['plugins/exclude/skills/explain-diff/SKILL.md'],
      'only the non-excluded prompt is a plugin skill',
    );
  });

  it('should emit no plugin for a pack whose every member is excluded', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.compile(resolved, {
      version: VERSION,
      packs: [
        {
          ...packOf('allexcluded', ['shared/author-artifact']),
          pluginExclude: ['shared/author-artifact'],
        },
      ],
    });

    assert.deepEqual(pluginKeys(files, 'allexcluded'), [], 'no files under the pack folder');
    assert.ok(
      !marketplaceNames(files).includes('allexcluded'),
      'no marketplace entry for the empty pack',
    );
  });

  it('should keep the scaffold id for a language prompt', async () => {
    const { resolved } = await compileBundled();
    const target = new ClaudeCodeTarget();
    const files = await target.scaffold!(
      'csharp/cs-deploy',
      withPrompt(resolved, 'csharp/cs-deploy'),
      { projectDir: '/fake' },
    );

    assert.ok(
      '.claude/skills/csharp-cs-deploy/SKILL.md' in files,
      'the scaffold has no namespace, so it keeps the full id',
    );
  });
});
