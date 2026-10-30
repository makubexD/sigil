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
import type { FileMap, ResolvedCatalog } from '../../dist-cli/types';
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
});
