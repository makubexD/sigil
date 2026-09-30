/**
 * `claude: { skills: [<skill id>] }` on an agent — Claude Code's subagent `skills:` preload field
 * (code.claude.com/docs/en/sub-agents: "Skills to preload into the subagent's context at startup").
 * Authored as catalog skill ids, validated by the reference graph, emitted as skill names.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../../dist-cli/load';
import { validateCatalog } from '../../dist-cli/validate';
import { AgentSchema } from '../../dist-cli/schema';
import { renderArtifact } from '../../dist-cli/targets/emit';
import { CLAUDE_AGENT_SPEC } from '../../dist-cli/targets/claude-code/spec/agent';
import { COPILOT_AGENT_SPEC } from '../../dist-cli/targets/copilot/spec/agent';
import type { ResolvedArtifact } from '../../dist-cli/types';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { CATALOG_DIR } from '../helpers/catalog';
import { withTempDir } from '../helpers/temp-dir';

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
import { makeAgent } from '../helpers/fixtures';

const preloading = (skills: string[]) =>
  makeAgent({ claude: { skills } }) as unknown as ResolvedArtifact;

describe('agent claude.skills preload', () => {
  it('schema accepts claude.skills as a list of ids', () => {
    const fm = makeAgent({ claude: { skills: ['shared/cli'] } }).frontmatter;
    const parsed = AgentSchema.safeParse(fm);
    assert.ok(parsed.success);
    assert.deepEqual(parsed.data.claude?.skills, ['shared/cli']);
  });

  it('Claude emits a top-level skills: list of skill names', () => {
    const out = renderArtifact(
      CLAUDE_AGENT_SPEC,
      preloading(['shared/cli', 'csharp/cs-release']),
      {},
    );
    assert.match(out, /^skills:\n {2}- cli\n {2}- cs-release$/m);
    assert.doesNotMatch(out, /shared\/cli/);
  });

  it('Copilot ignores the claude namespace', () => {
    const out = renderArtifact(COPILOT_AGENT_SPEC, preloading(['shared/cli']), {});
    assert.doesNotMatch(out, /skills:/);
  });

  it('validate rejects an unknown or non-skill id', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const agent = makeAgent({
      id: 'test/preloader',
      name: 'preloader',
      claude: { skills: ['does-not/exist', 'shared/cli-rules'] },
    });
    Object.assign(agent, { id: 'test/preloader' });
    catalog.artifacts.push(agent as never);
    catalog.byId.set(agent.id, agent as never);

    const errors = validateCatalog(catalog).errors.map(e => e.error);
    assert.ok(
      errors.some(e => e.includes("'does-not/exist' does not exist")),
      errors.join('\n'),
    );
    assert.ok(
      errors.some(e => e.includes("'shared/cli-rules' has kind 'rule'")),
      errors.join('\n'),
    );
  });

  it('validate rejects a preloaded skill whose name is not its id segment', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const skill = catalog.byId.get('shared/cli')!;
    skill.frontmatter.name = 'cli-guide';
    const agent = makeAgent({ id: 'test/preloader', claude: { skills: ['shared/cli'] } });
    Object.assign(agent, { id: 'test/preloader' });
    catalog.artifacts.push(agent as never);
    catalog.byId.set(agent.id, agent as never);

    const errors = validateCatalog(catalog).errors.map(e => e.error);
    assert.ok(
      errors.some(e => e.includes("'shared/cli' is named 'cli-guide'")),
      errors.join('\n'),
    );
  });

  it('add warns when an agent preloads a skill that is not installed', () => {
    withTempDir(dir => {
      const r = spawnSync(
        process.execPath,
        [
          CLI,
          'add',
          'agent:shared/cli-auditor',
          '--target',
          'claude',
          '--yes',
          '--project-dir',
          dir,
        ],
        { encoding: 'utf8' },
      );
      assert.match(r.stderr, /shared\/cli-auditor preloads skill shared\/cli/);
      assert.match(r.stderr, /sigil add skill:shared\/cli/);
    });
  });

  it('add stays quiet when the preloaded skill is installed too', () => {
    withTempDir(dir => {
      const r = spawnSync(
        process.execPath,
        [CLI, 'add', 'skill:shared/cli', '--target', 'claude', '--yes', '--project-dir', dir],
        { encoding: 'utf8' },
      );
      assert.doesNotMatch(r.stderr, /preloads skill/);
    });
  });
});
