/**
 * The Cursor `agent` spec (unregistered until step 4): a subagent file at `.cursor/agents/`
 * lists no tools, so its `readonly` line is the nearest mapping of the catalog's neutral tool
 * list, and a list the switch cannot carry is skipped rather than widened.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { renderArtifact } from '../../dist-cli/targets/emit';
import { restrictionOutcome } from '../../dist-cli/targets/tool-restriction';
import { CURSOR_AGENT_SPEC } from '../../dist-cli/targets/cursor/spec/agent';
import { parseFrontmatter } from '../../dist-cli/frontmatter-parse';
import { CATALOG_DIR, loadResolvedCatalog } from '../helpers/catalog';
import { makeAgent } from '../helpers/fixtures';
import { withTempDir } from '../helpers/temp-dir';
import type { ResolvedArtifact, ResolvedCatalog } from '../../dist-cli/types';

/** Frontmatter keys a Cursor subagent file may carry from this spec. */
const CURSOR_AGENT_KEYS = new Set(['name', 'description', 'readonly']);

/** Renders a catalog agent through the Cursor spec; fails when the id is absent. */
function renderCatalogAgent(catalog: ResolvedCatalog, id: string): string {
  const artifact = catalog.byId.get(id);
  assert.ok(artifact, `${id} is in the catalog`);
  return renderArtifact(CURSOR_AGENT_SPEC, artifact, {});
}

/** Renders an in-memory agent through the Cursor spec. */
function renderInMemory(fm: Record<string, unknown>): string {
  return renderArtifact(CURSOR_AGENT_SPEC, makeAgent(fm) as unknown as ResolvedArtifact, {});
}

describe('cursor agent spec — catalog', () => {
  it('should write shared/code-reviewer as readonly: true, warning that shell was lost', async () => {
    const catalog = await loadResolvedCatalog();
    const artifact = catalog.byId.get('shared/code-reviewer');
    assert.ok(artifact, 'shared/code-reviewer is in the catalog');

    assert.equal(CURSOR_AGENT_SPEC.outputPath(artifact, {}), '.cursor/agents/code-reviewer.md');
    assert.ok(CURSOR_AGENT_SPEC.pathPattern.test('.cursor/agents/code-reviewer.md'));

    const out = renderCatalogAgent(catalog, 'shared/code-reviewer');
    assert.match(out, /^readonly: true$/m);

    const outcome = restrictionOutcome(CURSOR_AGENT_SPEC, artifact.frontmatter);
    assert.equal(outcome.kind, 'nearest');
    if (outcome.kind !== 'nearest') return;
    assert.match(outcome.warning, /shell/);
  });

  it('should leave the readonly line off python/py-debugger, warning that edit and shell were lost', async () => {
    const catalog = await loadResolvedCatalog();
    const artifact = catalog.byId.get('python/py-debugger');
    assert.ok(artifact, 'python/py-debugger is in the catalog');

    const out = renderCatalogAgent(catalog, 'python/py-debugger');
    assert.doesNotMatch(out, /^readonly:/m);

    const outcome = restrictionOutcome(CURSOR_AGENT_SPEC, artifact.frontmatter);
    assert.equal(outcome.kind, 'nearest');
    if (outcome.kind !== 'nearest') return;
    // `missing` keeps the authored order, which is `shell, edit` here.
    assert.match(outcome.warning, /\bedit\b/);
    assert.match(outcome.warning, /\bshell\b/);
  });

  it('should render every catalog agent with only the Cursor agent keys', async () => {
    const catalog = await loadResolvedCatalog();
    const agents = catalog.artifacts.filter(a => a.kind === 'agent');
    assert.ok(agents.length > 0, 'the catalog has agents');

    for (const agent of agents) {
      const out = renderArtifact(CURSOR_AGENT_SPEC, agent, {});
      for (const key of Object.keys(parseFrontmatter(out).data)) {
        assert.ok(CURSOR_AGENT_KEYS.has(key), `${agent.id} emitted ${key}`);
      }
    }
  });

  it('should mark every catalog agent with no edit tool readonly', async () => {
    const catalog = await loadResolvedCatalog();
    const readOnlyAgents = catalog.artifacts.filter(
      a => a.kind === 'agent' && !(a.frontmatter.tools as string[]).includes('edit'),
    );
    assert.ok(readOnlyAgents.length > 0, 'the catalog has read-only agents');

    for (const agent of readOnlyAgents) {
      assert.match(renderArtifact(CURSOR_AGENT_SPEC, agent, {}), /^readonly: true$/m);
    }
  });

  it('should round-trip every catalog agent through the frontmatter parser', async () => {
    const catalog = await loadResolvedCatalog();
    const agents = catalog.artifacts.filter(a => a.kind === 'agent');
    assert.ok(agents.length > 0, 'the catalog has agents');

    for (const agent of agents) {
      const { data } = parseFrontmatter(renderArtifact(CURSOR_AGENT_SPEC, agent, {}));
      assert.equal(data.name, agent.frontmatter.name);
      assert.equal(data.description, agent.frontmatter.description);
    }
  });
});

describe('cursor agent spec — in-memory', () => {
  it('should mark a read-only list readonly and call it exact', () => {
    const agent = makeAgent({ tools: ['read', 'search'] });
    assert.match(renderInMemory(agent.frontmatter), /^readonly: true$/m);
    assert.deepEqual(restrictionOutcome(CURSOR_AGENT_SPEC, agent.frontmatter), { kind: 'exact' });
  });

  it('should skip a strict list naming shell and refuse to render it', () => {
    const agent = makeAgent({ tools: ['read', 'search', 'shell'] });
    const outcome = restrictionOutcome(CURSOR_AGENT_SPEC, agent.frontmatter);
    assert.equal(outcome.kind, 'skip');
    if (outcome.kind !== 'skip') return;
    assert.match(outcome.reason, /shell/);
    assert.throws(() => renderInMemory(agent.frontmatter), /shell/);
  });

  it('should write no readonly line for an agent with no tools, and call it exact', () => {
    const agent = makeAgent({});
    assert.doesNotMatch(renderInMemory(agent.frontmatter), /^readonly:/m);
    assert.deepEqual(restrictionOutcome(CURSOR_AGENT_SPEC, agent.frontmatter), { kind: 'exact' });
  });

  it('should skip a disallowedTools restriction the spec does not carry', () => {
    const agent = makeAgent({ disallowedTools: ['edit'] });
    const outcome = restrictionOutcome(CURSOR_AGENT_SPEC, agent.frontmatter);
    assert.equal(outcome.kind, 'skip');
    if (outcome.kind !== 'skip') return;
    assert.match(outcome.reason, /disallowedTools/);
  });
});

// ── end to end through the built CLI ──────────────────────────────────────────

const CLI = path.resolve(__dirname, '../../dist-cli/cli.js');
const HOME_VAR = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';
const CODE_REVIEWER = 'shared/code-reviewer';
const PY_DEBUGGER = 'python/py-debugger';
const GENERATE_TESTS = 'typescript/ts-generate-tests';
/** The agent `typescript/ts-generate-tests`'s `uses.agents` names. */
const GENERATE_TESTS_AGENT = 'ts-code-reviewer';

/** A project dir and a home dir, both empty. */
function makeDirs(work: string): { project: string; home: string } {
  const project = path.join(work, 'project');
  const home = path.join(work, 'home');
  fs.mkdirSync(project);
  fs.mkdirSync(home);
  return { project, home };
}

/** Runs the built CLI in `project` with HOME pointed at `home`, asserting it exited 0. */
function runSigil(
  project: string,
  home: string,
  ...args: string[]
): { stdout: string; stderr: string } {
  const done = spawnSync(process.execPath, [CLI, ...args, '--project-dir', project], {
    cwd: project,
    encoding: 'utf8',
    input: '',
    windowsHide: true,
    env: { ...process.env, [HOME_VAR]: home },
  });
  assert.equal(done.status, 0, `${done.stdout ?? ''}${done.stderr ?? ''}`);
  return { stdout: done.stdout ?? '', stderr: done.stderr ?? '' };
}

/** `sigil add --target cursor --yes` for `ids`, returning the output for its warnings. */
const addCursor = (project: string, home: string, ...ids: string[]) =>
  runSigil(project, home, 'add', ...ids, '--target', 'cursor', '--yes');

/** Copies the bundled catalog so a test can edit an artifact source. */
function copyCatalog(work: string): string {
  const catalogDir = path.join(work, 'catalog');
  fs.cpSync(CATALOG_DIR, catalogDir, { recursive: true });
  return catalogDir;
}

/** Hashes every file under `dir`, so a test can prove a command wrote nothing. */
function treeHash(dir: string): string {
  const files = (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter(rel => fs.statSync(path.join(dir, rel)).isFile())
    .sort();
  return files.map(rel => `${rel}\0${fs.readFileSync(path.join(dir, rel), 'utf8')}`).join('\0');
}

interface StatusRow {
  id: string;
  kind: string;
  target: string;
  status: string;
}

/** `sigil status --json --target <target>` rows. */
function statusRows(project: string, home: string, target: string): StatusRow[] {
  const run = runSigil(project, home, 'status', '--json', '--target', target);
  return JSON.parse(run.stdout) as StatusRow[];
}

/** The Cursor agent file for `name`. */
const agentFile = (project: string, name: string): string =>
  path.join(project, '.cursor', 'agents', `${name}.md`);

/** The Cursor skill file for `name`. */
const skillFile = (project: string, name: string): string =>
  path.join(project, '.cursor', 'skills', name, 'SKILL.md');

describe('cursor agents — end to end', () => {
  it('should install shared/code-reviewer readonly, warning that shell was lost', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const { stderr } = addCursor(project, home, CODE_REVIEWER);

      const data = parseFrontmatter(
        fs.readFileSync(agentFile(project, 'code-reviewer'), 'utf8'),
      ).data;
      assert.equal(data.readonly, true);
      assert.match(stderr, /shared\/code-reviewer/);
      assert.match(stderr, /nearest/);
      assert.match(stderr, /\bshell\b/);
    });
  });

  it('should leave readonly off python/py-debugger, warning that edit was lost', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const { stderr } = addCursor(project, home, PY_DEBUGGER);

      const data = parseFrontmatter(
        fs.readFileSync(agentFile(project, 'py-debugger'), 'utf8'),
      ).data;
      assert.equal('readonly' in data, false, 'no readonly line');
      assert.match(stderr, /python\/py-debugger/);
      assert.match(stderr, /\bedit\b/);
    });
  });

  // `uses.agents` drives co-install only; a Boundary section renders from `relatedArtifacts`
  // (src/targets/shared/boundary.ts), which this skill does not set.
  it('should co-install the agent a skill uses', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      addCursor(project, home, GENERATE_TESTS);

      assert.ok(fs.existsSync(skillFile(project, 'ts-generate-tests')), 'the skill is written');
      assert.ok(
        fs.existsSync(agentFile(project, GENERATE_TESTS_AGENT)),
        'the agent the skill uses is co-installed',
      );
    });
  });

  it('should report the installed agent up to date, not outdated', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      addCursor(project, home, CODE_REVIEWER);

      const row = statusRows(project, home, 'cursor').find(r => r.id === CODE_REVIEWER);
      assert.ok(row, 'status lists the agent');
      assert.equal(row.kind, 'agent');
      assert.equal(row.status, 'up-to-date');
    });
  });

  it('should leave every file unchanged when the same agent is added again', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      addCursor(project, home, CODE_REVIEWER);
      const before = treeHash(project);

      const second = addCursor(project, home, CODE_REVIEWER);

      assert.equal(treeHash(project), before, 'a second add writes nothing');
      assert.doesNotMatch(`${second.stdout}${second.stderr}`, /conflict/i);
    });
  });

  it('should rewrite the agent from a changed catalog and keep readonly', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      const catalogDir = copyCatalog(work);
      const catalogArgs = ['--catalog-dir', catalogDir];
      runSigil(project, home, 'add', CODE_REVIEWER, '--target', 'cursor', '--yes', ...catalogArgs);

      const source = path.join(catalogDir, 'shared/agents/code-reviewer.agent.md');
      const original = fs.readFileSync(source, 'utf8');
      const edited = original.replace(
        'Generic fallback code-review agent',
        'Updated end-to-end description',
      );
      assert.notEqual(edited, original, 'the description edit applied');
      fs.writeFileSync(source, edited);

      runSigil(project, home, 'update', '--target', 'cursor', '--yes', ...catalogArgs);

      const data = parseFrontmatter(
        fs.readFileSync(agentFile(project, 'code-reviewer'), 'utf8'),
      ).data;
      assert.match(String(data.description), /Updated end-to-end description/);
      assert.equal(data.readonly, true);
    });
  });

  it('should remove the agent file when it is uninstalled', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      addCursor(project, home, CODE_REVIEWER);

      runSigil(project, home, 'uninstall', CODE_REVIEWER, '--target', 'cursor', '--yes');

      assert.equal(fs.existsSync(agentFile(project, 'code-reviewer')), false);
    });
  });

  it('should install both copies and note that Cursor uses its own', () => {
    withTempDir(work => {
      const { project, home } = makeDirs(work);
      addCursor(project, home, CODE_REVIEWER);
      runSigil(project, home, 'add', CODE_REVIEWER, '--target', 'claude', '--yes');

      assert.ok(fs.existsSync(path.join(project, '.claude/agents/code-reviewer.md')));
      assert.ok(fs.existsSync(agentFile(project, 'code-reviewer')));

      const { stdout } = runSigil(project, home, 'status', '--target', 'cursor');
      assert.match(stdout, /shared\/code-reviewer/);
      assert.match(stdout, /uses its own copy/);
    });
  });
});
