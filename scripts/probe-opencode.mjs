#!/usr/bin/env node
/* global console, process */
/**
 * Re-runnable OpenCode probe: installs sigil's real output into a fresh repo and reads it back
 * through the V1 loader commands (`debug skill`, `agent list`, `debug agent`, `mcp list`,
 * `debug config`). It answers the V1 cases of docs/plan-opencode-target-e.md and the OpenCode
 * rows that need no model (docs/decisions/opencode-target-2026-11.md).
 *
 * `catalog/` is copied to a temp dir, the fixture artifacts under scripts/opencode-probe/catalog/
 * are overlaid on that copy, and each probe installs what it needs from it with `sigil add`.
 * Every spawned `opencode` and `sigil` gets its own HOME, TMPDIR and a minimal PATH, stdin closed
 * and a 60-second timeout, so nothing of the caller's is visible. The probe never runs
 * `opencode run`, and it is not part of `npm test`, `check` or `ci:local`. Without `opencode` on
 * PATH it prints a skip notice and exits 0.
 *
 * Usage: node scripts/probe-opencode.mjs [--only <id,...>] [--dry-run] [--keep]
 *
 * Each line ends `OK`, `CHANGED` (the result moved: revisit that ADR row) or `ERROR` (setup,
 * `opencode` or teardown failed, so there is no result). Anything but `OK` exits 1.
 */
import { spawnSync } from 'node:child_process';
import {
  accessSync,
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(REPO, 'catalog');
const FIXTURES = join(REPO, 'scripts', 'opencode-probe');
const CLI = join(REPO, 'dist-cli', 'cli.js');
const PROBE_SERVER = join(FIXTURES, 'mcp-server.mjs');
const WRAPPED_SERVER = join(REPO, 'scripts', 'antigravity-probe', 'mcp-server.mjs');
const TIMEOUT_MS = 60_000;
const MAX_EVIDENCE = 300;
const REMOTE_URL = 'https://mcp.jam.dev/mcp';
const JSONC_SERVER = 'probe-jsonc';

/**
 * The probes, in run order. Each plain object is one probe record: `id`, `expect` (`pass` or
 * `fail`), `setup(repo, ctx)`, `args` (the `opencode` subcommand), `env` (extra process env) and
 * `check(result, repo, ctx)` returning `{ verdict, evidence }`. A probe's one `opencode` run is
 * scripted in `runProbe`; `--dry-run` prints its command line instead.
 */
const PROBES = [
  {
    id: 'O-skill',
    expect: 'pass',
    setup: (repo, ctx) => addProbe(ctx, repo, 'shared/feature'),
    args: ['debug', 'skill'],
    env: {},
    check: result => outputVerdict(result, /(^|[^\w-])feature([^\w-]|$)/m, 'debug skill'),
  },
  {
    id: 'O-agent',
    expect: 'pass',
    setup: (repo, ctx) => addProbe(ctx, repo, 'shared/code-reviewer'),
    args: ['agent', 'list'],
    env: {},
    check: result => outputVerdict(result, /code-reviewer\s*\(subagent\)/, 'agent list'),
  },
  {
    id: 'O-perm',
    expect: 'pass',
    setup: (repo, ctx) => addProbe(ctx, repo, 'shared/code-reviewer'),
    args: ['debug', 'agent', 'code-reviewer'],
    env: {},
    check: result => {
      const text = `${result.stdout}\n${result.stderr}`;
      // The rules are ordered: `'*': deny`, then the read object's `'*': allow` and `'*.env': ask`.
      const deny = text.search(/\*\s*:\s*['"]?deny/);
      const read = text.search(/['"]?read['"]?\s*:/);
      const allow = text.search(/\*\s*:\s*['"]?allow/);
      const envAsk = text.search(/\.env\s*:\s*['"]?ask/);
      const ordered = deny >= 0 && read > deny && allow > read && envAsk > allow;
      const verdict = result.status === 0 && ordered ? 'pass' : 'fail';
      return { verdict, evidence: `exit ${result.status}; ${oneLine(text)}` };
    },
  },
  {
    id: 'O-mcp',
    expect: 'pass',
    setup: (repo, ctx) => addProbe(ctx, repo, 'shared/probe-env', 'project'),
    args: ['mcp', 'list'],
    env: { PROBE_HOST_TOKEN: 'tangerine' },
    check: (result, _repo, ctx) => tokenVerdict(result, ctx, 'TOKEN=tangerine'),
  },
  {
    id: 'O-mcp-unset',
    expect: 'pass',
    setup: (repo, ctx) => addProbe(ctx, repo, 'shared/probe-env', 'project'),
    args: ['mcp', 'list'],
    env: {},
    check: (result, _repo, ctx) => tokenVerdict(result, ctx, 'TOKEN='),
  },
  {
    id: 'O-mcp-quote',
    expect: 'pass',
    setup: (repo, ctx) => addProbe(ctx, repo, 'shared/probe-env', 'project'),
    args: ['mcp', 'list'],
    env: { PROBE_HOST_TOKEN: 'a"b' },
    check: result => {
      const text = `${result.stdout}\n${result.stderr}`;
      const connected = /connected/.test(text);
      const errored = result.status !== 0 || /error/i.test(text);
      return {
        verdict: errored && !connected ? 'pass' : 'fail',
        evidence: `exit ${result.status}; connected: ${connected}; ${oneLine(text)}`,
      };
    },
  },
  {
    id: 'O-mcp-remote',
    expect: 'pass',
    setup: (repo, ctx) => addProbe(ctx, repo, 'shared/maku-jam', 'project'),
    args: ['debug', 'config'],
    env: {},
    check: result => {
      const config = parseJsonOutput(result.stdout);
      const server = config?.mcp?.['maku-jam'];
      const pass = result.status === 0 && server?.type === 'remote' && server?.url === REMOTE_URL;
      return {
        verdict: pass ? 'pass' : 'fail',
        evidence: `exit ${result.status}; mcp['maku-jam']: ${oneLine(JSON.stringify(server))}`,
      };
    },
  },
  {
    id: 'O-mcp-user',
    expect: 'pass',
    setup: (repo, ctx) => addProbe(ctx, repo, 'shared/probe-env', 'user'),
    args: ['mcp', 'list'],
    env: { PROBE_HOST_TOKEN: 'persimmon' },
    check: (result, _repo, ctx) => {
      const file = join(ctx.runDir, 'home', '.config', 'opencode', 'opencode.json');
      const written = existsSync(file);
      const connected = result.status === 0 && /connected/.test(result.stdout);
      return {
        verdict: written && connected ? 'pass' : 'fail',
        evidence: `written: ${written}; connected: ${connected}`,
      };
    },
  },
  {
    id: 'O-jsonc',
    expect: 'pass',
    setup: (repo, ctx) => {
      writeFileSync(join(repo, 'opencode.jsonc'), jsoncFixture());
      addProbe(ctx, repo, 'shared/probe-env', 'project');
    },
    args: ['mcp', 'list'],
    env: { PROBE_HOST_TOKEN: 'tangerine' },
    check: (result, repo) => {
      const unchanged = readFileSync(join(repo, 'opencode.jsonc'), 'utf8') === jsoncFixture();
      const text = result.stdout;
      const both = text.includes(JSONC_SERVER) && text.includes('probe-env');
      return {
        verdict: result.status === 0 && unchanged && both ? 'pass' : 'fail',
        evidence: `jsonc unchanged: ${unchanged}; both servers: ${both}; exit ${result.status}`,
      };
    },
  },
];

/** Prints an error and exits 1. */
function die(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

/** Reads the value of a flag that takes one argument. */
function flagValue(argv, index, flag) {
  const value = argv[index];
  if (value === undefined || value.startsWith('--')) die(`${flag} needs a value`);
  return value;
}

/** Parses the runner's flags into `{ only, dryRun, keep }`. */
function parseArgs(argv) {
  const options = { only: null, dryRun: false, keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--keep') options.keep = true;
    else if (arg === '--only') {
      i += 1;
      options.only = flagValue(argv, i, arg).split(',');
    } else die(`unknown option: ${arg}`);
  }
  return options;
}

/** Finds an executable on the caller's PATH, without running it. */
function findOnPath(name) {
  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (dir === '') continue;
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not in this directory; keep looking.
    }
  }
  return null;
}

/** The trimmed `--version` output, or null when `opencode` cannot run; runs under isolation. */
function opencodeVersion(bin, ctx) {
  const result = spawnSync(bin, ['--version'], {
    encoding: 'utf8',
    env: isolationEnv(ctx),
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: TIMEOUT_MS,
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

/**
 * Copies `catalog/` to `runDir/catalog`, overlays the probe fixtures, and replaces both
 * placeholders: `__PROBE_SERVER__` becomes the wrapper's absolute path and `__PROBE_OUT__`
 * becomes `<runDir>/token.txt`, the file the wrapper appends to.
 */
function prepareCatalog(runDir) {
  const target = join(runDir, 'catalog');
  cpSync(CATALOG, target, { recursive: true });
  cpSync(join(FIXTURES, 'catalog'), target, { recursive: true });
  const mcpFile = join(target, 'shared', 'mcps', 'probe-env.mcp.md');
  const text = readFileSync(mcpFile, 'utf8')
    .replaceAll('__PROBE_SERVER__', PROBE_SERVER)
    .replaceAll('__PROBE_OUT__', join(runDir, 'token.txt'));
  writeFileSync(mcpFile, text);
  return target;
}

/** Runs one command and throws on a non-zero exit, so setup stops before `opencode` starts. */
function run(command, args, options) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: TIMEOUT_MS,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
  }
  return result;
}

/**
 * The isolation environment for one spawned `opencode` or `sigil`: a scratch HOME and TMPDIR,
 * a PATH holding only Node (for the fixture server's `node` command) and the system dirs, plus
 * the probe's own variables.
 */
function isolationEnv(ctx, extra = {}) {
  return {
    HOME: join(ctx.runDir, 'home'),
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    TMPDIR: join(ctx.runDir, 'tmp'),
    ...extra,
  };
}

/** Installs one catalog artifact into the probe repo with `sigil add`, under isolation. */
function addProbe(ctx, repo, id, scope) {
  const args = [CLI, 'add', id, '--target', 'opencode', '--yes', '--catalog-dir', ctx.catalogDir];
  if (scope !== undefined) args.push('--scope', scope);
  run(process.execPath, args, { cwd: repo, env: isolationEnv(ctx) });
}

/** The root `opencode.jsonc` the O-jsonc probe must leave byte-identical. */
function jsoncFixture() {
  return [
    '{',
    '  // The probe keeps this comment and this server.',
    '  "mcp": {',
    `    "${JSONC_SERVER}": {`,
    '      "type": "local",',
    `      "command": ["node", ${JSON.stringify(WRAPPED_SERVER)}],`,
    '      "environment": { "PROBE_G": "jsonc-ok" }',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');
}

/** The last non-empty line of a file, or null when the file is absent or empty. */
function lastNonEmptyLine(path) {
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .filter(line => line !== '');
  return lines.at(-1) ?? null;
}

/** One line of `opencode mcp list` output plus the wrapper's recorded token line. */
function tokenVerdict(result, ctx, expected) {
  const connected = result.status === 0 && /connected/.test(result.stdout);
  const token = lastNonEmptyLine(join(ctx.runDir, 'token.txt'));
  return {
    verdict: connected && token === expected ? 'pass' : 'fail',
    evidence: `connected: ${connected}; token: ${token ?? 'missing'}`,
  };
}

/** Parses the JSON `opencode debug config` prints, tolerating non-JSON preamble lines. */
function parseJsonOutput(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Not pure JSON; try the outermost object.
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** The verdict for a command that succeeds on a zero exit and a match in its output. */
function outputVerdict(result, pattern, label) {
  const pass = result.status === 0 && pattern.test(result.stdout);
  return {
    verdict: pass ? 'pass' : 'fail',
    evidence: `${label}: exit ${result.status}; ${oneLine(result.stdout || result.stderr)}`,
  };
}

/** Collapses text to one bounded line, so an evidence field stays one line. */
function oneLine(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_EVIDENCE);
}

/** Quotes one argv element for the dry run's printed command. */
function quoteArg(arg) {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : JSON.stringify(arg);
}

/** Renders a command line the way the probe would run it. */
function formatCommand(command, args) {
  return [command, ...args].map(quoteArg).join(' ');
}

/** Makes the probe's own fresh `git init` repo, with the one commit OpenCode expects. */
function makeRepo(id, ctx) {
  const repo = mkdtempSync(join(tmpdir(), `sigil-probe-${id}-`));
  ctx.repos.push(repo);
  run('git', ['init', '-q'], { cwd: repo });
  run(
    'git',
    [
      '-c',
      'user.name=sigil-probe',
      '-c',
      'user.email=probe@sigil.invalid',
      'commit',
      '--allow-empty',
      '-q',
      '-m',
      'probe',
    ],
    { cwd: repo },
  );
  return repo;
}

/**
 * Runs one probe: fresh repo, setup, then `opencode` (unless `--dry-run`), then `check`.
 * Returns `{ probe, got, mark, evidence, failed, repo }`. Setup failures are `ERROR`, never a
 * result — including for the probe that expects a failure.
 */
function runProbe(probe, ctx, options) {
  const repo = makeRepo(probe.id, ctx);
  try {
    probe.setup?.(repo, ctx);
    if (options.dryRun) {
      return {
        probe,
        got: '-',
        mark: 'DRY-RUN',
        evidence: formatCommand(ctx.opencodeBin, probe.args),
        failed: false,
        repo,
      };
    }
    const result = spawnSync(ctx.opencodeBin, probe.args, {
      cwd: repo,
      encoding: 'utf8',
      env: isolationEnv(ctx, probe.env),
      timeout: TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error) throw result.error;
    writeFileSync(
      join(ctx.runDir, `${probe.id}.log`),
      `${result.stdout ?? ''}${result.stderr ?? ''}`,
    );
    const checked = probe.check(result, repo, ctx);
    return {
      probe,
      got: checked.verdict,
      mark: checked.verdict === probe.expect ? 'OK' : 'CHANGED',
      evidence: checked.evidence,
      failed: false,
      repo,
    };
  } catch (error) {
    return {
      probe,
      got: 'error',
      mark: 'ERROR',
      evidence: `error: ${oneLine(error.message)}`,
      failed: true,
      repo,
    };
  }
}

/** Keeps only the requested probe ids; an unknown id is an error. */
function selectProbes(probes, only) {
  if (only === null) return probes;
  const wanted = new Set(only);
  const unknown = only.filter(id => !probes.some(probe => probe.id === id));
  if (unknown.length > 0) die(`unknown probe id(s): ${unknown.join(', ')}`);
  return probes.filter(probe => wanted.has(probe.id));
}

/** Removes the catalog copy and probe repos unless `--keep` asked to keep them. */
function cleanup(ctx, keep) {
  if (keep) return;
  rmSync(join(ctx.runDir, 'catalog'), { recursive: true, force: true });
  for (const repo of ctx.repos) rmSync(repo, { recursive: true, force: true });
}

/** Entry point: parse flags, check for `opencode`, prepare the catalog, run the probes. */
function main() {
  const options = parseArgs(process.argv.slice(2));
  const bin = findOnPath('opencode');
  if (bin === null) {
    console.log('skip: opencode not on PATH');
    return;
  }
  if (!existsSync(CLI)) die(`missing ${CLI}; run npm run build first`);

  const probes = selectProbes(PROBES, options.only);
  const runDir = mkdtempSync(join(tmpdir(), 'sigil-probe-run-'));
  mkdirSync(join(runDir, 'home'), { recursive: true });
  mkdirSync(join(runDir, 'tmp'), { recursive: true });
  const ctx = { runDir, repos: [], catalogDir: null, opencodeBin: bin };
  // `--version` is the one live `opencode` call the dry run avoids: it is not needed to list.
  const version = options.dryRun ? null : opencodeVersion(bin, ctx);
  if (!options.dryRun && version === null) {
    rmSync(runDir, { recursive: true, force: true });
    die('opencode --version failed');
  }
  ctx.catalogDir = prepareCatalog(runDir);
  let bad = false;

  try {
    for (const probe of probes) {
      let outcome;
      try {
        outcome = runProbe(probe, ctx, options);
      } catch (error) {
        outcome = {
          probe,
          got: 'error',
          mark: 'ERROR',
          evidence: `teardown failed: ${oneLine(error.message)}`,
          failed: true,
        };
      }
      console.log(
        `${outcome.probe.id}  expect=${outcome.probe.expect}  got=${outcome.got}  ${outcome.mark}  ${outcome.evidence}`,
      );
      if (outcome.mark === 'CHANGED' || outcome.failed) bad = true;
    }
  } finally {
    console.log(`logs: ${ctx.runDir}`);
    if (options.keep) {
      for (const repo of ctx.repos) console.log(`kept: ${repo}`);
    }
    cleanup(ctx, options.keep);
  }

  console.log(version === null ? `opencode ${bin}` : `opencode ${version}`);
  process.exitCode = bad ? 1 : 0;
}

main();
