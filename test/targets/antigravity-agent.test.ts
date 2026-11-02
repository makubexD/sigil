/**
 * The Antigravity agent tool dialect: each neutral tool expands to the Antigravity names probe D1
 * saw load and work, one name per tool, with `todo` unmapped (there is no task-list tool) and a
 * provider pattern passed through verbatim. `ANTIGRAVITY_ALL_TOOL_NAMES` is the full list an agent
 * with no authored `tools` gets, and `ANTIGRAVITY_MODEL_TIERS` is the closed model table.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { renderTools } from '../../dist-cli/targets/tool-dialect';
import { restrictionOutcome } from '../../dist-cli/targets/tool-restriction';
import { renderArtifact } from '../../dist-cli/targets/emit';
import { NEUTRAL_TOOLS } from '../../dist-cli/tool-vocabulary';
import {
  ANTIGRAVITY_AGENT_TOOL_DIALECT,
  ANTIGRAVITY_ALL_TOOL_NAMES,
  ANTIGRAVITY_MODEL_TIERS,
  antigravityAgentToolNames,
} from '../../dist-cli/targets/antigravity/tool-dialect';
import { ANTIGRAVITY_AGENT_SPEC } from '../../dist-cli/targets/antigravity/spec/agent';
import { parseFrontmatter } from '../../dist-cli/frontmatter-parse';
import { CATALOG_DIR, loadResolvedCatalog } from '../helpers/catalog';
import { makeAgent } from '../helpers/fixtures';
import { withTempDir } from '../helpers/temp-dir';
import type { ResolvedArtifact, ResolvedCatalog } from '../../dist-cli/types';

describe('antigravityAgentToolNames', () => {
  it('expands read then search in table order', () => {
    assert.deepStrictEqual(antigravityAgentToolNames(['read', 'search']), [
      'view_file',
      'grep_search',
      'find_by_name',
      'list_dir',
    ]);
  });

  it('writes four authored groups in authored order with no duplicates', () => {
    assert.deepStrictEqual(antigravityAgentToolNames(['read', 'search', 'shell', 'edit']), [
      'view_file',
      'grep_search',
      'find_by_name',
      'list_dir',
      'run_command',
      'write_to_file',
      'replace_file_content',
    ]);
  });

  it('treats legacy names as their neutral tool', () => {
    assert.deepStrictEqual(antigravityAgentToolNames(['Read', 'Grep', 'Bash']), [
      'view_file',
      'grep_search',
      'find_by_name',
      'list_dir',
      'run_command',
    ]);
  });

  it('passes a provider pattern through verbatim after the mapped names', () => {
    assert.deepStrictEqual(antigravityAgentToolNames(['read', 'mcp:github/*']), [
      'view_file',
      'mcp:github/*',
    ]);
  });
});

describe('antigravity agent tool dialect', () => {
  it('is inexact and missing todo, which has no Antigravity tool', () => {
    assert.deepStrictEqual(renderTools(ANTIGRAVITY_AGENT_TOOL_DIALECT, ['todo']), {
      kind: 'names',
      names: [],
      exact: false,
      missing: ['todo'],
    });
  });

  it('is exact for read, search, shell and edit', () => {
    assert.deepStrictEqual(
      renderTools(ANTIGRAVITY_AGENT_TOOL_DIALECT, ['read', 'search', 'shell', 'edit']),
      {
        kind: 'names',
        names: [
          'view_file',
          'grep_search',
          'find_by_name',
          'list_dir',
          'run_command',
          'write_to_file',
          'replace_file_content',
        ],
        exact: true,
        missing: [],
      },
    );
  });

  it('writes every defined entry in NEUTRAL_TOOLS order, deduped, with no todo', () => {
    assert.deepStrictEqual(
      ANTIGRAVITY_ALL_TOOL_NAMES,
      antigravityAgentToolNames([...NEUTRAL_TOOLS]),
    );
    assert.deepStrictEqual(ANTIGRAVITY_ALL_TOOL_NAMES, [
      'view_file',
      'grep_search',
      'find_by_name',
      'list_dir',
      'write_to_file',
      'replace_file_content',
      'run_command',
      'search_web',
      'read_url_content',
      'invoke_subagent',
    ]);
    assert.ok(!ANTIGRAVITY_ALL_TOOL_NAMES.includes('todo'));
    assert.equal(new Set(ANTIGRAVITY_ALL_TOOL_NAMES).size, ANTIGRAVITY_ALL_TOOL_NAMES.length);
  });

  it('maps the three neutral model tiers to the closed Antigravity table', () => {
    assert.deepStrictEqual(ANTIGRAVITY_MODEL_TIERS, {
      fast: 'flash_lite',
      balanced: 'flash',
      deep: 'pro',
    });
  });
});

// ── the agent emit spec ───────────────────────────────────────────────────────

/** The Antigravity names for `read`, `search` and `shell`, the list every catalog agent has. */
const READ_SEARCH_SHELL = ['view_file', 'grep_search', 'find_by_name', 'list_dir', 'run_command'];

/** Renders a catalog agent through the Antigravity spec; fails when the id is absent. */
function renderCatalogAgent(catalog: ResolvedCatalog, id: string): string {
  const artifact = catalog.byId.get(id);
  assert.ok(artifact, `${id} is in the catalog`);
  return renderArtifact(ANTIGRAVITY_AGENT_SPEC, artifact, { catalog });
}

/** Renders an in-memory agent through the Antigravity spec. */
function renderInMemory(fm: Record<string, unknown>): string {
  return renderArtifact(ANTIGRAVITY_AGENT_SPEC, makeAgent(fm) as unknown as ResolvedArtifact, {});
}

describe('antigravity agent spec — catalog', () => {
  it('writes typescript/ts-code-reviewer with name, description and the read/search/shell names, no model', async () => {
    const catalog = await loadResolvedCatalog();
    const out = renderCatalogAgent(catalog, 'typescript/ts-code-reviewer');
    const { data } = parseFrontmatter(out);

    assert.equal(data.name, 'ts-code-reviewer');
    assert.match(String(data.description), /TypeScript/);
    assert.equal('model' in data, false, 'no model line');
    assert.deepEqual(data.tools, READ_SEARCH_SHELL);
    assert.match(out, /^tools:\n {2}- view_file$/m);
  });

  it('writes shared/code-reviewer model: flash on the line before tools', async () => {
    const catalog = await loadResolvedCatalog();
    const out = renderCatalogAgent(catalog, 'shared/code-reviewer');

    assert.equal(parseFrontmatter(out).data.model, 'flash');
    assert.ok(out.indexOf('model: flash') >= 0, 'the model line is written');
    assert.ok(out.indexOf('model: flash') < out.indexOf('tools:'), 'model precedes tools');
  });

  it('writes the edit names for typescript/ts-refactor-specialist', async () => {
    const catalog = await loadResolvedCatalog();
    const { data } = parseFrontmatter(
      renderCatalogAgent(catalog, 'typescript/ts-refactor-specialist'),
    );

    assert.deepEqual(data.tools, [...READ_SEARCH_SHELL, 'write_to_file', 'replace_file_content']);
  });

  it('marks every catalog agent exact', async () => {
    const catalog = await loadResolvedCatalog();
    const agents = catalog.artifacts.filter(a => a.kind === 'agent');
    assert.ok(agents.length > 0, 'the catalog has agents');

    for (const agent of agents) {
      assert.deepEqual(
        restrictionOutcome(ANTIGRAVITY_AGENT_SPEC, agent.frontmatter),
        { kind: 'exact' },
        agent.id,
      );
    }
  });

  it('parses every catalog agent tools value back as an array of strings', async () => {
    const catalog = await loadResolvedCatalog();
    const agents = catalog.artifacts.filter(a => a.kind === 'agent');
    assert.ok(agents.length > 0, 'the catalog has agents');

    for (const agent of agents) {
      const { data } = parseFrontmatter(renderArtifact(ANTIGRAVITY_AGENT_SPEC, agent, { catalog }));
      assert.ok(Array.isArray(data.tools), `${agent.id}: tools is an array`);
      for (const name of data.tools as unknown[]) {
        assert.equal(typeof name, 'string', `${agent.id}: every tool name is a string`);
      }
    }
  });

  it('starts the body with the title and leaves no sigil token', async () => {
    const catalog = await loadResolvedCatalog();
    const artifact = catalog.byId.get('shared/code-reviewer');
    assert.ok(artifact, 'shared/code-reviewer is in the catalog');

    const out = renderArtifact(ANTIGRAVITY_AGENT_SPEC, artifact, { catalog });
    const body = out.slice(out.indexOf('\n---\n') + 5).trimStart();

    assert.ok(body.startsWith('# Code Reviewer\n'), body.slice(0, 40));
    assert.doesNotMatch(out, /\{sigil:/);
  });
});

describe('antigravity agent spec — in-memory', () => {
  it('writes the full tool list when tools is absent', () => {
    const { data } = parseFrontmatter(renderInMemory({}));

    assert.deepEqual(data.tools, [...ANTIGRAVITY_ALL_TOOL_NAMES]);
  });

  it('writes flash_lite for fast and pro for deep', () => {
    assert.equal(parseFrontmatter(renderInMemory({ model: 'fast' })).data.model, 'flash_lite');
    assert.equal(parseFrontmatter(renderInMemory({ model: 'deep' })).data.model, 'pro');
  });

  it('ignores the claude: namespace model', () => {
    const out = renderInMemory({ claude: { model: 'opus' } });

    assert.equal('model' in parseFrontmatter(out).data, false, 'no model line');
    assert.doesNotMatch(out, /^model:/m);
  });

  it('skips a disallowedTools restriction it cannot carry', () => {
    const agent = makeAgent({ disallowedTools: ['edit'] });
    const outcome = restrictionOutcome(ANTIGRAVITY_AGENT_SPEC, agent.frontmatter);

    assert.equal(outcome.kind, 'skip');
    if (outcome.kind !== 'skip') return;
    assert.match(outcome.reason, /disallowedTools/);
  });

  it('skips tools: [read, todo], naming todo', () => {
    const agent = makeAgent({ tools: ['read', 'todo'] });
    const outcome = restrictionOutcome(ANTIGRAVITY_AGENT_SPEC, agent.frontmatter);

    assert.equal(outcome.kind, 'skip');
    if (outcome.kind !== 'skip') return;
    assert.match(outcome.reason, /todo/);
    assert.throws(() => renderInMemory({ tools: ['read', 'todo'] }), /todo/);
  });
});

// ── end to end through the built CLI ──────────────────────────────────────────
// Same setup as `antigravity-mcp.test.ts`: a temp project and a temp HOME, and the bundled
// catalog copied so a test can change what "the catalog" holds.

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const HOME_VAR = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';
const TARGET = 'antigravity';
const AGENT_ID = 'typescript/ts-code-reviewer';
const AGENT_NAME = 'ts-code-reviewer';
const AGENT_FILE = path.posix.join('.agents', 'agents', `${AGENT_NAME}.md`);
const CATALOG_AGENT = path.join('languages', 'typescript', 'agents', `${AGENT_NAME}.agent.md`);

/** A project dir and a home dir, both empty. */
function makeDirs(work: string): { project: string; home: string } {
  const project = path.join(work, 'project');
  const home = path.join(work, 'home');
  fs.mkdirSync(project);
  fs.mkdirSync(home);
  return { project, home };
}

/** The bundled catalog, copied so a test can edit what the catalog holds. */
function copyCatalog(work: string): string {
  const catalogDir = path.join(work, 'catalog');
  fs.cpSync(CATALOG_DIR, catalogDir, { recursive: true });
  return catalogDir;
}

/** Runs the built CLI and returns the spawn result, for cases expected to fail. */
function sigilResult(cwd: string, home: string, ...args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args, '--project-dir', cwd], {
    cwd,
    encoding: 'utf8',
    input: '',
    windowsHide: true,
    env: { ...process.env, [HOME_VAR]: home },
  });
}

/** Runs the built CLI in `cwd` with HOME pointed at `home`, and asserts it exited 0. */
function sigil(cwd: string, home: string, ...args: string[]): void {
  const done = sigilResult(cwd, home, ...args);
  assert.equal(done.status, 0, `${done.stdout ?? ''}${done.stderr ?? ''}`);
}

/** `sigil add --target antigravity typescript/ts-code-reviewer`. */
const addAgent = (project: string, home: string, catalogDir: string): void =>
  sigil(project, home, 'add', AGENT_ID, '--target', TARGET, '--yes', '--catalog-dir', catalogDir);

/** `sigil update --target antigravity`. */
const updateAgents = (project: string, home: string, catalogDir: string): void =>
  sigil(project, home, 'update', '--target', TARGET, '--yes', '--catalog-dir', catalogDir);

/** `sigil uninstall typescript/ts-code-reviewer --target <target>`. */
const uninstallAgent = (project: string, home: string, target = TARGET): void =>
  sigil(project, home, 'uninstall', AGENT_ID, '--target', target, '--yes');

const readJson = (file: string): Record<string, any> => JSON.parse(fs.readFileSync(file, 'utf8'));

describe('antigravity agents — end to end', () => {
  it('case 1: add writes .agents/agents/<name>.md and records it in the manifest', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, AGENT_FILE);

      addAgent(project, home, catalogDir);

      assert.ok(fs.existsSync(file), 'the agent file is written');
      const manifest = readJson(path.join(project, '.sigil', 'manifest.json'));
      const entry = manifest.entries.find(
        (e: { id: string; target: string }) => e.id === AGENT_ID && e.target === TARGET,
      );
      assert.ok(entry, 'the manifest lists the agent for antigravity');
      assert.equal(entry.kind, 'agent');
      assert.deepEqual(
        entry.files.map((f: { path: string }) => f.path),
        [AGENT_FILE],
      );
    });
  });

  it('case 2: add again leaves the file byte-identical', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, AGENT_FILE);

      addAgent(project, home, catalogDir);
      const afterFirst = fs.readFileSync(file);
      addAgent(project, home, catalogDir);

      assert.ok(fs.readFileSync(file).equals(afterFirst), 'a second add writes nothing');
    });
  });

  it('case 3: update rewrites the agent after its catalog description changes', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, AGENT_FILE);
      addAgent(project, home, catalogDir);

      const source = path.join(catalogDir, CATALOG_AGENT);
      const original = fs.readFileSync(source, 'utf8');
      const edited = original.replace(
        'Use to review a TypeScript/Node.js diff',
        'Updated end-to-end description',
      );
      assert.notEqual(edited, original, 'the description edit applied');
      fs.writeFileSync(source, edited);

      updateAgents(project, home, catalogDir);

      assert.match(fs.readFileSync(file, 'utf8'), /Updated end-to-end description/);
    });
  });

  it('case 4: uninstall removes the agent file', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const file = path.join(project, AGENT_FILE);

      addAgent(project, home, catalogDir);
      assert.ok(fs.existsSync(file), 'the agent file is written');

      uninstallAgent(project, home);

      assert.equal(fs.existsSync(file), false);
    });
  });

  it('case 5: an agent with disallowedTools is skipped, naming the reason, writing nothing', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const source = path.join(catalogDir, CATALOG_AGENT);
      const original = fs.readFileSync(source, 'utf8');
      // Antigravity has no denylist: with `toolPolicy` dropped the skip is fail-closed.
      const edited = original.replace(
        'toolPolicy: nearest\n---',
        'disallowedTools:\n  - edit\n---',
      );
      assert.notEqual(edited, original, 'the fixture edit applied');
      fs.writeFileSync(source, edited);

      const done = sigilResult(
        project,
        home,
        'add',
        AGENT_ID,
        '--target',
        TARGET,
        '--yes',
        '--catalog-dir',
        catalogDir,
      );

      assert.equal(done.status, 0, `${done.stdout ?? ''}${done.stderr ?? ''}`);
      const output = `${done.stdout ?? ''}${done.stderr ?? ''}`;
      assert.match(output, /skipped/);
      assert.match(output, /disallowedTools/);
      assert.equal(fs.existsSync(path.join(project, AGENT_FILE)), false, 'nothing written');
    });
  });

  it('case 6: build writes agent files inside pack plugins', async () => {
    const catalog = await loadResolvedCatalog();
    const catalogAgents = new Set(
      catalog.artifacts
        .filter(a => a.kind === 'agent')
        .map(a => `${String(a.frontmatter.name)}.md`),
    );
    assert.ok(catalogAgents.size > 0, 'the catalog has agents');

    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const outDir = path.join(work, 'out');

      const done = spawnSync(
        process.execPath,
        [CLI, 'build', '--target', TARGET, '--out-dir', outDir],
        {
          cwd: project,
          encoding: 'utf8',
          input: '',
          windowsHide: true,
          env: { ...process.env, [HOME_VAR]: home },
        },
      );
      assert.equal(done.status, 0, `${done.stdout ?? ''}${done.stderr ?? ''}`);

      const pluginsDir = path.join(outDir, TARGET, 'plugins');
      const written = fs.readdirSync(pluginsDir).flatMap(plugin => {
        const agentDir = path.join(pluginsDir, plugin, 'agents');
        return fs.existsSync(agentDir)
          ? fs.readdirSync(agentDir).filter(name => name.endsWith('.md'))
          : [];
      });
      assert.ok(written.length > 0, 'the build writes agent files');
      for (const name of written) assert.ok(catalogAgents.has(name), `${name} is a catalog agent`);
      assert.equal(
        fs.existsSync(path.join(outDir, TARGET, '.agents')),
        false,
        'no scaffold layout',
      );
    });
  });

  it('case 7: cursor and antigravity each write the agent; uninstalling one leaves the other', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const cursorFile = path.join(project, '.cursor', 'agents', `${AGENT_NAME}.md`);
      const antigravityFile = path.join(project, AGENT_FILE);

      sigil(
        project,
        home,
        'add',
        AGENT_ID,
        '--target',
        'cursor',
        '--yes',
        '--catalog-dir',
        catalogDir,
      );
      addAgent(project, home, catalogDir);

      assert.ok(fs.existsSync(cursorFile), 'the cursor agent is written');
      assert.ok(fs.existsSync(antigravityFile), 'the antigravity agent is written');

      uninstallAgent(project, home);

      assert.equal(fs.existsSync(antigravityFile), false, 'the antigravity file is removed');
      assert.ok(fs.existsSync(cursorFile), 'the cursor file stays');
    });
  });
});
