/**
 * The Antigravity target writes Agent Skills to `.agents/skills/`, the same files the
 * agents-standard target writes, and nothing else yet. Every kind it has no spec for is skipped
 * with the reason its capability table declares.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAllTargets, getTarget } from '../../dist-cli/targets/index';
import { loadResolvedCatalog } from '../helpers/catalog';
import { resolveSelection } from '../../dist-cli/select/selector-resolve';
import { carriedKinds, installableKinds, kindSupport } from '../../dist-cli/targets/capabilities';
import type { ArtifactKind } from '../../dist-cli/types';

const TARGET = 'antigravity';
const AGENTS_STANDARD = 'agents-standard';
const SKILL = 'typescript/ts-generate-tests'; // uses rules, so they get inlined
const SHARED_SKILL = 'shared/cli'; // carries reference files and inlined rules

/** The SKILL.md content a scaffold wrote. */
function skillContent(files: Record<string, string>): string {
  const file = Object.keys(files).find(f => f.endsWith('/SKILL.md'));
  assert.ok(file, 'the scaffold wrote a SKILL.md');
  return files[file]!;
}

describe('antigravity target', () => {
  it('should scaffold the same skill files as agents-standard, byte for byte', async () => {
    const catalog = await loadResolvedCatalog();
    const antigravity = await getTarget(TARGET).scaffold!(SKILL, catalog, { projectDir: '.' });
    const standard = await getTarget(AGENTS_STANDARD).scaffold!(SKILL, catalog, {
      projectDir: '.',
    });

    assert.deepEqual(antigravity, standard);
  });

  it('should inline the skill rules instead of writing .agents/rules files', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).scaffold!(SHARED_SKILL, catalog, { projectDir: '.' });

    assert.ok(
      Object.keys(files).every(f => !f.startsWith('.agents/rules/')),
      'no .agents/rules/ file',
    );
    assert.match(skillContent(files), /## Coding guidelines to apply/);
  });

  it('should skip an agent, a prompt, a hook and an mcp, with the reason its capability row gives', async () => {
    const catalog = await loadResolvedCatalog();
    const target = getTarget(TARGET);

    const reasons: Record<string, RegExp> = {
      agent: /Phase D/,
      prompt: /no prompt files/,
      hook: /Phase E/,
      mcp: /Phase C/,
    };
    for (const kind of Object.keys(reasons) as ArtifactKind[]) {
      const artifact = catalog.artifacts.find(a => a.kind === kind);
      assert.ok(artifact, `the catalog has a ${kind}`);

      const result = resolveSelection({
        selectors: [`${kind}:${artifact.id}`],
        filters: {},
        catalog,
        packs: [],
        supportedKinds: installableKinds(target),
        carriedKinds: carriedKinds(target),
        targetName: TARGET,
      });

      assert.deepEqual(result.ids, []);
      assert.deepEqual(
        result.skipped.map(s => s.id),
        [artifact.id],
      );
      const skipped = result.skipped[0]!;
      assert.equal(skipped.kind, kind);
      assert.equal(skipped.cause, 'kind');
      assert.match(skipped.reason, /not supported/);

      const support = kindSupport(target, kind);
      assert.equal(support?.mode, 'none');
      assert.match(support.mode === 'none' ? support.reason : '', reasons[kind]!);
    }
  });

  it('should compile .agents/skills and no other target’s files', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).compile(catalog, { version: '0.0.0', packs: [] });
    const keys = Object.keys(files);

    assert.ok(
      keys.some(f => f.startsWith('.agents/skills/')),
      'skills are written',
    );
    assert.ok(
      keys.every(f => f !== 'AGENTS.md'),
      'no AGENTS.md',
    );
    assert.ok(
      keys.every(
        f => !f.startsWith('.claude/') && !f.startsWith('.github/') && !f.startsWith('.cursor/'),
      ),
      'no other target’s file',
    );
  });

  it('should be registered as antigravity, right after cursor', () => {
    assert.equal(getTarget(TARGET).name, TARGET);

    const names = getAllTargets().map(t => t.name);
    const cursor = names.indexOf('cursor');
    assert.ok(cursor >= 0, 'cursor is registered');
    assert.equal(names[cursor + 1], TARGET);
  });
});
