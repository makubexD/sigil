/**
 * The Codex target renders the same Agent Skills files as the open-standard target. Two targets can
 * therefore deliver one `.agents/skills/<name>/SKILL.md`: installing the second must not conflict,
 * and uninstalling either install must not delete a file the other still owns.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getTarget } from '../../dist-cli/targets/index';
import { detectProjectTarget } from '../../dist-cli/cli-helpers';
import { parseFrontmatter } from '../../dist-cli/frontmatter-parse';
import { renderArtifact } from '../../dist-cli/targets/emit';
import { CODEX_SKILL_SPEC } from '../../dist-cli/targets/codex/spec/skill';
import { loadResolvedCatalog } from '../helpers/catalog';
import { makeSkill } from '../helpers/fixtures';
import { withTempDirAsync } from '../helpers/temp-dir';
import { CATALOG, PACKS, add } from '../helpers/install-scenario';
import { buildAddPlan } from '../../dist-cli/commands/add/plan';
import { runUninstall } from '../../dist-cli/commands/uninstall';
import { resolveSelection } from '../../dist-cli/select/selector-resolve';
import { carriedKinds, installableKinds, kindSupport } from '../../dist-cli/targets/capabilities';
import type { AddOpts } from '../../dist-cli/commands/add';
import type { ResolvedArtifact } from '../../dist-cli/types';

/** Claude's tool names; none may reach a Codex skill, which documents no `allowed-tools` field. */
const CLAUDE_TOOL_NAMES = new Set([
  'Read',
  'Grep',
  'Glob',
  'Edit',
  'Write',
  'Bash',
  'WebFetch',
  'WebSearch',
  'Agent',
  'TodoWrite',
]);

/** Every word of a frontmatter value (strings and arrays of strings). */
function frontmatterTokens(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/[^A-Za-z-]+/);
  if (Array.isArray(value)) return value.flatMap(frontmatterTokens);
  return [];
}

const TARGET = 'codex';
const PEER = 'agents-standard';
const SKILL = 'typescript/ts-generate-tests'; // uses rules, so they get inlined

function addOpts(dir: string, target: string): AddOpts {
  return {
    projectDir: dir,
    catalogDir: CATALOG,
    packs: PACKS,
    target,
    deps: true,
    dryRun: false,
    interactive: false,
    yes: true,
    overwrite: false,
    settingsLocal: false,
  };
}

/** The one file the skill scaffolds: `.agents/skills/<name>/SKILL.md`. */
async function skillPath(): Promise<string> {
  const catalog = await loadResolvedCatalog();
  const name = catalog.byId.get(SKILL)!.frontmatter.name as string;
  return `.agents/skills/${name}/SKILL.md`;
}

function manifestEntries(dir: string): { id: string; target: string }[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.sigil/manifest.json'), 'utf8'));
  return manifest.entries.map((e: { id: string; target: string }) => ({
    id: e.id,
    target: e.target,
  }));
}

function uninstall(dir: string, target: string): Promise<void> {
  return runUninstall([SKILL], { projectDir: dir, target, yes: true, force: false, dryRun: false });
}

describe('codex target', () => {
  it('should render the same skill files as agents-standard, byte-identical outside SKILL.md', async () => {
    const catalog = await loadResolvedCatalog();
    const codex = await getTarget(TARGET).scaffold!(SKILL, catalog, { projectDir: '.' });
    const peer = await getTarget(PEER).scaffold!(SKILL, catalog, { projectDir: '.' });

    assert.deepEqual(Object.keys(codex).sort(), Object.keys(peer).sort());
    for (const file of Object.keys(peer)) {
      if (file.endsWith('/SKILL.md')) continue;
      assert.equal(codex[file], peer[file], `different bytes for ${file}`);
    }
  });

  it('should differ from agents-standard only by the allowed-tools line, which Codex leaves out', async () => {
    const catalog = await loadResolvedCatalog();
    const codex = await getTarget(TARGET).scaffold!(SKILL, catalog, { projectDir: '.' });
    const peer = await getTarget(PEER).scaffold!(SKILL, catalog, { projectDir: '.' });

    const file = Object.keys(codex).find(f => f.endsWith('/SKILL.md'))!;
    const withoutAllowed = peer[file]!.split('\n')
      .filter(line => !line.startsWith('allowed-tools:'))
      .join('\n');
    assert.equal(codex[file], withoutAllowed);
  });

  it('should leave allowed-tools out of a skill, as Codex documents no such field', () => {
    const skill = makeSkill({ allowedTools: ['Bash', 'Read'] }) as unknown as ResolvedArtifact;
    assert.doesNotMatch(renderArtifact(CODEX_SKILL_SPEC, skill, {}), /^allowed-tools:/m);
  });

  it('should leave allowed-tools and every Claude tool name out of the bundled catalog SKILL.md files', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).compile(catalog, { version: '0.0.0', packs: [] });
    const skills = Object.entries(files).filter(([file]) => file.endsWith('/SKILL.md'));
    assert.ok(skills.length > 0, 'the compile wrote skills');

    for (const [file, raw] of skills) {
      const { data } = parseFrontmatter(raw);
      assert.ok(!('allowed-tools' in data), `${file} has an allowed-tools line`);
      for (const token of Object.entries(data)
        .filter(([key]) => key !== 'name' && key !== 'description')
        .flatMap(([, value]) => frontmatterTokens(value))) {
        assert.ok(!CLAUDE_TOOL_NAMES.has(token), `${file} carries the Claude name ${token}`);
      }
    }
  });

  it('should refuse codex skills once agents-standard installed skills, and the reverse', async () => {
    await withTempDirAsync(async dir => {
      await add(dir, PEER, [`skill:${SKILL}`]);
      await assert.rejects(() => add(dir, TARGET, [`skill:${SKILL}`]), /writes the same files/);
      assert.deepEqual(manifestEntries(dir), [{ id: SKILL, target: PEER }]);
    });
    await withTempDirAsync(async dir => {
      await add(dir, TARGET, [`skill:${SKILL}`]);
      await assert.rejects(() => add(dir, PEER, [`skill:${SKILL}`]), /writes the same files/);
    });
  });

  it('should refuse antigravity skills once codex installed skills, and the reverse with agents-standard', async () => {
    await withTempDirAsync(async dir => {
      await add(dir, TARGET, ['skill:shared/cli']);
      await assert.rejects(
        () => add(dir, 'antigravity', ['skill:shared/cli']),
        /codex already installed skills in this project, and antigravity writes the same files\./,
      );
    });
    await withTempDirAsync(async dir => {
      await add(dir, 'antigravity', ['skill:shared/cli']);
      await assert.rejects(
        () => add(dir, PEER, ['skill:shared/cli']),
        /antigravity already installed skills in this project, and agents-standard writes the same files\./,
      );
    });
  });

  it('should detect codex, not agents-standard, in a project that installed for codex', async () => {
    await withTempDirAsync(async dir => {
      await add(dir, TARGET, [`skill:${SKILL}`]);
      assert.equal(detectProjectTarget(dir), TARGET);
    });
  });

  it('should allow codex skills after the agents-standard install is removed', async () => {
    await withTempDirAsync(async dir => {
      await add(dir, PEER, [`skill:${SKILL}`]);
      await uninstall(dir, PEER);
      await add(dir, TARGET, [`skill:${SKILL}`]);
      assert.ok(fs.existsSync(path.join(dir, await skillPath())));
    });
  });

  it('should keep a hook for codex beside agents-standard skills', async () => {
    await withTempDirAsync(async dir => {
      await add(dir, PEER, [`skill:${SKILL}`]);
      await add(dir, TARGET, ['shared/protect-config']);
      assert.ok(fs.existsSync(path.join(dir, '.codex/hooks.json')));
    });
  });

  it('should still conflict over a file with different content, leaving it unchanged', async () => {
    await withTempDirAsync(async dir => {
      const relPath = await skillPath();
      const fullPath = path.join(dir, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, 'hand-written, not sigil\n');

      const plan = await buildAddPlan([`skill:${SKILL}`], addOpts(dir, TARGET));
      assert.ok(plan);
      assert.deepEqual(Object.keys(plan.conflicting), [relPath]);

      await add(dir, TARGET, [`skill:${SKILL}`]);
      assert.equal(fs.readFileSync(fullPath, 'utf8'), 'hand-written, not sigil\n');
    });
  });

  it('should skip an agent for codex, citing the subagent tool limit', async () => {
    const catalog = await loadResolvedCatalog();
    const agent = catalog.artifacts.find(a => a.kind === 'agent')!;
    const target = getTarget(TARGET);
    const result = resolveSelection({
      selectors: [`agent:${agent.id}`],
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
      [agent.id],
    );
    assert.equal(result.skipped[0]!.kind, 'agent');
    assert.equal(result.skipped[0]!.cause, 'kind');
    assert.match(result.skipped[0]!.reason, /not supported/);

    const support = kindSupport(target, 'agent');
    assert.equal(support?.mode, 'none');
    const reason = support?.mode === 'none' ? support.reason : '';
    assert.match(reason, /can't restrict tools/);
  });

  it('should compile AGENTS.md and .agents/skills, and no .codex file', async () => {
    const catalog = await loadResolvedCatalog();
    const files = await getTarget(TARGET).compile(catalog, { version: '0.0.0', packs: [] });

    assert.ok(files['AGENTS.md'], 'AGENTS.md is written');
    assert.ok(
      Object.keys(files).some(f => f.startsWith('.agents/skills/')),
      'skills are written',
    );
    assert.ok(
      Object.keys(files).every(f => !f.startsWith('.codex/')),
      'no .codex/ file',
    );
  });
});
