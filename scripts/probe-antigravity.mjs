#!/usr/bin/env node
/**
 * Re-runnable Antigravity probe: re-checks the ADR's findings against the current `agy` and
 * live-checks every kind sigil ships to Antigravity (docs/decisions/antigravity-target-2026-11.md).
 *
 * It probes sigil's real output: `catalog/` is copied to a temp dir, the fixture artifacts under
 * scripts/antigravity-probe/catalog/ are overlaid on that copy, and each probe installs or builds
 * what it needs from it. Every probe is a model call, so this is not part of `npm test`, `check`
 * or `ci:local`. Without `agy` on PATH it prints a skip notice and exits 0.
 *
 * Usage: node scripts/probe-antigravity.mjs [--model <id>] [--only <id,...>] [--dry-run] [--keep]
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(REPO, 'catalog');
const FIXTURES = join(REPO, 'scripts', 'antigravity-probe');
const CLI = join(REPO, 'dist-cli', 'cli.js');
const VALIDATOR = join(REPO, 'scripts', 'validate-antigravity-plugins.cjs');
const PROBE_SERVER = join(FIXTURES, 'mcp-server.mjs');
const GEMINI_CONFIG = join(homedir(), '.gemini', 'config');
const PLUGINS_DIR = join(GEMINI_CONFIG, 'plugins');
const IMPORT_MANIFEST = join(GEMINI_CONFIG, 'import_manifest.json');
const DEFAULT_MODEL = 'gemini-3.8-flash-low';
const PRINT_TIMEOUT = '90s';
const AGY_KILL_TIMEOUT_MS = 180_000;
const MAX_EVIDENCE = 300;

/**
 * The probes, in run order. Each plain object is one probe record: `id`, `adr` (the ADR row it
 * re-checks), `expect` (`pass` or `fail`, the result recorded on `1.4.12`), `setup(repo, ctx)`,
 * `prompt`, `args` (extra `agy` flags), `allow` (session-only `permissions.allow` rules), `env`
 * (extra process env), `check(stream, repo, stdout)` returning `{ verdict, evidence }`, and
 * optional `teardown(repo, ctx)`. A probe with `command(repo, ctx)` runs that instead of `agy`
 * and returns `{ verdict, evidence }` itself; `commandLine(ctx)` is what `--dry-run` prints for
 * it.
 */
const PROBES = [
  {
    id: 'G-skill',
    adr: 'P1/B',
    expect: 'pass',
    setup: (repo, ctx) => addProbe(ctx, repo, 'shared/probe-skill'),
    prompt: 'What is the probe-skill marker? Answer with the marker only.',
    args: [],
    allow: [],
    env: {},
    check: stream => answerVerdict(stream, 'SKILL-G'),
  },
  {
    id: 'G-rule',
    adr: 'B',
    expect: 'pass',
    setup: (repo, ctx) => addProbe(ctx, repo, 'shared/probe-rule'),
    prompt: 'What is the probe-rule marker? Answer with the marker only.',
    args: [],
    allow: [],
    env: {},
    check: stream => answerVerdict(stream, 'RULE-G'),
  },
  {
    id: 'G-glob',
    adr: 'B1',
    expect: 'fail',
    setup: (repo, ctx) => {
      mkdirSync(join(repo, '.agents', 'rules'), { recursive: true });
      cpSync(join(FIXTURES, 'glob-rule.md'), join(repo, '.agents', 'rules', 'probe-glob.md'));
      mkdirSync(join(repo, 'src'), { recursive: true });
      writeFileSync(join(repo, 'src', 'app.ts'), 'export const a = 1;\n');
    },
    prompt:
      'Add the line `export const b = 2;` to src/app.ts, then tell me the probe-glob marker, or NONE.',
    args: [],
    allow: ['write_file(*)', 'edit_file(*)'],
    env: {},
    check: stream => answerVerdict(stream, 'GLOB-G'),
  },
  {
    id: 'G-agent',
    adr: 'D1/D2',
    expect: 'pass',
    setup: (repo, ctx) => {
      addProbe(ctx, repo, 'shared/probe-agent');
      writeFileSync(join(repo, 'note.txt'), 'FILE-G\n');
    },
    prompt: 'Say your marker, then read note.txt and repeat its content.',
    args: ['--agent', 'probe-agent'],
    allow: [],
    env: {},
    check: stream => {
      const answer = finalAnswer(stream);
      if (answer === null) return { verdict: 'fail', evidence: 'no result event in stream' };
      const verdict = answer.includes('AGENT-G') && answer.includes('FILE-G') ? 'pass' : 'fail';
      return { verdict, evidence: `answer: ${oneLine(answer)}` };
    },
  },
  {
    id: 'G-mcp',
    adr: 'C1/P5',
    expect: 'pass',
    setup: (repo, ctx) => addProbe(ctx, repo, 'shared/probe-env', 'project'),
    prompt: 'Call the probe_env tool of the probe-env MCP server and repeat its result.',
    args: [],
    allow: ['mcp(*)'],
    env: { PROBE_G: 'g-ok' },
    check: stream => answerVerdict(stream, 'PROBE_G=g-ok'),
  },
  {
    id: 'G-hook',
    adr: 'E1',
    expect: 'pass',
    setup: (repo, ctx) => addProbe(ctx, repo, 'shared/protect-config', 'project'),
    prompt: 'Use your file-writing tool to create .env holding A=1.',
    args: [],
    allow: ['write_file(*)'],
    env: {},
    check: (stream, repo, stdout) => {
      const wroteEnv = existsSync(join(repo, '.env'));
      const blocked = stdout.includes('blocked write to protected file');
      return {
        verdict: !wroteEnv && blocked ? 'pass' : 'fail',
        evidence: `.env present: ${wroteEnv}; blocked in stream: ${blocked}`,
      };
    },
  },
  {
    id: 'G-plugin',
    adr: 'F1/F2',
    expect: 'pass',
    setup: (repo, ctx) => {
      ensureProbeBuild(ctx);
      if (!ctx.dryRun) {
        run('agy', ['plugin', 'install', join(pluginRoot(ctx), 'probe')], { cwd: repo });
      }
    },
    prompt: 'What is the probe-skill marker? Answer with the marker only.',
    args: [],
    allow: [],
    env: {},
    check: stream => answerVerdict(stream, 'SKILL-G'),
    teardown: () => uninstallPlugin(),
  },
  {
    id: 'G-validate',
    adr: 'F2d',
    expect: 'pass',
    setup: (_repo, ctx) => ensureProbeBuild(ctx),
    command: (_repo, ctx) => {
      const result = spawnSync(process.execPath, [VALIDATOR], {
        encoding: 'utf8',
        env: { ...process.env, SIGIL_ANTIGRAVITY_DIST: pluginRoot(ctx) },
      });
      const detail = oneLine(result.stdout || result.stderr);
      if (result.error) throw result.error;
      return {
        verdict: result.status === 0 ? 'pass' : 'fail',
        evidence: `validator exit ${result.status}: ${detail}`,
      };
    },
    commandLine: ctx =>
      `SIGIL_ANTIGRAVITY_DIST=${pluginRoot(ctx)} ${formatCommand(process.execPath, [VALIDATOR])}`,
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

/** Parses the runner's flags into `{ model, only, dryRun, keep }`. */
function parseArgs(argv) {
  const options = { model: DEFAULT_MODEL, only: null, dryRun: false, keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--keep') options.keep = true;
    else if (arg === '--model') {
      i += 1;
      options.model = flagValue(argv, i, arg);
    } else if (arg === '--only') {
      i += 1;
      options.only = flagValue(argv, i, arg).split(',');
    } else die(`unknown option: ${arg}`);
  }
  return options;
}

/**
 * Checks that `agy` is on PATH and returns its trimmed `--version` output, or null when it is
 * absent (a missing `agy` skips the run, dry or not).
 */
function agyVersion() {
  const result = spawnSync('agy', ['--version'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

/**
 * Copies `catalog/` to `runDir/catalog`, overlays the probe fixtures, and replaces the
 * `__PROBE_SERVER__` placeholder in the probe MCP entry with the fixture server's absolute path.
 */
function prepareCatalog(runDir) {
  const target = join(runDir, 'catalog');
  cpSync(CATALOG, target, { recursive: true });
  cpSync(join(FIXTURES, 'catalog'), target, { recursive: true });
  const mcpFile = join(target, 'shared', 'mcps', 'probe-env.mcp.md');
  const text = readFileSync(mcpFile, 'utf8').replaceAll('__PROBE_SERVER__', PROBE_SERVER);
  writeFileSync(mcpFile, text);
  return target;
}

/** Runs one command and throws on a non-zero exit, so setup stops before `agy` starts. */
function run(command, args, options) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || result.error?.message || '').trim();
    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
  }
  return result;
}

/**
 * Installs one catalog artifact into the probe repo with `sigil add`. `local` is the default;
 * Antigravity's config kinds (mcp, hook) have no personal per-project file, so those probes ask
 * for `project` (`.agents/`) instead.
 */
function addProbe(ctx, repo, id, scope = 'local') {
  run(
    process.execPath,
    [
      CLI,
      'add',
      id,
      '--target',
      'antigravity',
      '--scope',
      scope,
      '--yes',
      '--catalog-dir',
      ctx.catalogDir,
    ],
    { cwd: repo },
  );
}

/**
 * Builds the `probe` pack once per run into `<runDir>/dist` and caches it on `ctx`, so G-plugin
 * and G-validate share one build.
 */
function ensureProbeBuild(ctx) {
  if (ctx.probeDist !== undefined) return ctx.probeDist;
  const dist = join(ctx.runDir, 'dist');
  run(
    process.execPath,
    [
      CLI,
      'build',
      '--target',
      'antigravity',
      '--catalog-dir',
      ctx.catalogDir,
      '--packs',
      join(FIXTURES, 'packs.yaml'),
      '--out-dir',
      dist,
    ],
    { cwd: REPO },
  );
  ctx.probeDist = dist;
  return dist;
}

/** The plugins root of the run's one build. */
function pluginRoot(ctx) {
  return join(ensureProbeBuild(ctx), 'antigravity', 'plugins');
}

/**
 * Uninstalls the probe plugin and checks that `agy` kept no trace: `agy plugin list --json` must
 * be `[]`, which throws (failing the run) otherwise. Then removes only what an empty `agy`
 * config leaves behind (decision 4): the plugins folder when it is empty, and the import
 * manifest when its whole content is `{"imports": null}`. Nothing else under `~/.gemini/`.
 */
function uninstallPlugin() {
  run('agy', ['plugin', 'uninstall', 'probe']);
  const listed = spawnSync('agy', ['plugin', 'list', '--json'], { encoding: 'utf8' });
  let plugins;
  try {
    plugins = JSON.parse(listed.stdout);
  } catch {
    throw new Error(`agy plugin list --json did not parse: ${oneLine(listed.stdout)}`);
  }
  if (!Array.isArray(plugins) || plugins.length !== 0) {
    throw new Error(`agy plugin list --json is not []: ${oneLine(listed.stdout)}`);
  }
  try {
    if (readdirSync(PLUGINS_DIR).length === 0) rmdirSync(PLUGINS_DIR);
  } catch {
    // Absent or not empty: nothing this probe may remove.
  }
  try {
    const manifest = JSON.parse(readFileSync(IMPORT_MANIFEST, 'utf8'));
    const keys = Object.keys(manifest ?? {});
    if (keys.length === 1 && keys[0] === 'imports' && manifest.imports === null) {
      unlinkSync(IMPORT_MANIFEST);
    }
  } catch {
    // Absent or holding anything else: leave it alone.
  }
}

/** Makes the probe's own fresh `git init` repo in its own `os.tmpdir()` folder. */
function makeRepo(id, ctx) {
  const repo = mkdtempSync(join(tmpdir(), `sigil-probe-${id}-`));
  ctx.repos.push(repo);
  run('git', ['init', '-q'], { cwd: repo });
  return repo;
}

/**
 * The `agy` argv for one probe, per the ADR's probe rules: model, stream-json, a 90s print
 * timeout, an optional session-only allow list, extra flags, then `-p` last.
 */
function agyArgs(probe, model) {
  const args = [
    '--model',
    model,
    '--output-format',
    'stream-json',
    '--print-timeout',
    PRINT_TIMEOUT,
  ];
  if ((probe.allow ?? []).length > 0) {
    args.push('--settings', JSON.stringify({ permissions: { allow: probe.allow } }));
  }
  args.push(...(probe.args ?? []));
  args.push('-p', probe.prompt);
  return args;
}

/** Quotes one argv element for the dry run's printed command. */
function quoteArg(arg) {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : JSON.stringify(arg);
}

/** Renders a command line the way the probe would run it. */
function formatCommand(command, args) {
  return [command, ...args].map(quoteArg).join(' ');
}

/** Parses each stdout line as JSON, skipping the lines that do not parse. */
function parseStream(stdout) {
  const events = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // Not a JSON event (a warning or progress line); the probe does not need it.
    }
  }
  return events;
}

/**
 * Reads `result.response` from the stream's `result` event: the model's final answer, or null
 * when the run produced no result event (the probe got no answer).
 */
function finalAnswer(stream) {
  for (let i = stream.length - 1; i >= 0; i -= 1) {
    if (stream[i]?.event === 'result') return stream[i].result?.response ?? null;
  }
  return null;
}

/** Collapses text to one bounded line, so an evidence field stays one line. */
function oneLine(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_EVIDENCE);
}

/**
 * The verdict for probes that pass when the final answer contains `codeword`. Evidence is the
 * answer, or the reason there is none.
 */
function answerVerdict(stream, codeword) {
  const answer = finalAnswer(stream);
  if (answer === null) return { verdict: 'fail', evidence: 'no result event in stream' };
  return {
    verdict: answer.includes(codeword) ? 'pass' : 'fail',
    evidence: `answer: ${oneLine(answer)}`,
  };
}

/**
 * Runs one probe: fresh repo, setup, then `agy` (unless `--dry-run`), then `check`, with
 * `teardown` in `finally`. Returns `{ probe, got, mark, evidence, failed, repo }`.
 */
function runProbe(probe, ctx, options) {
  const repo = makeRepo(probe.id, ctx);
  let outcome;
  try {
    probe.setup?.(repo, ctx);
    if (probe.command) {
      if (options.dryRun) {
        outcome = {
          probe,
          got: '-',
          mark: 'DRY-RUN',
          evidence: probe.commandLine?.(ctx) ?? 'command',
          failed: false,
          repo,
        };
        return outcome;
      }
      const checked = probe.command(repo, ctx);
      outcome = {
        probe,
        got: checked.verdict,
        mark: checked.verdict === probe.expect ? 'OK' : 'CHANGED',
        evidence: checked.evidence,
        failed: false,
        repo,
      };
      return outcome;
    }
    if (options.dryRun) {
      outcome = {
        probe,
        got: '-',
        mark: 'DRY-RUN',
        evidence: formatCommand('agy', agyArgs(probe, options.model)),
        failed: false,
        repo,
      };
      return outcome;
    }
    const result = spawnSync('agy', agyArgs(probe, options.model), {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, ...(probe.env ?? {}) },
      timeout: AGY_KILL_TIMEOUT_MS,
    });
    const stdout = result.stdout ?? '';
    writeFileSync(join(ctx.runDir, `${probe.id}.jsonl`), stdout);
    const checked = probe.check(parseStream(stdout), repo, stdout);
    const agyFailed = result.status !== 0;
    const exitNote = agyFailed ? ` (agy exit ${result.status ?? result.signal ?? 'unknown'})` : '';
    outcome = {
      probe,
      got: checked.verdict,
      mark: checked.verdict === probe.expect ? 'OK' : 'CHANGED',
      evidence: `${checked.evidence}${exitNote}`,
      failed: agyFailed,
      repo,
    };
    return outcome;
  } catch (error) {
    outcome = {
      probe,
      got: 'fail',
      mark: probe.expect === 'fail' ? 'OK' : 'CHANGED',
      evidence: `error: ${oneLine(error.message)}`,
      failed: true,
      repo,
    };
    return outcome;
  } finally {
    if (!options.dryRun) probe.teardown?.(repo, ctx);
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

/**
 * Removes the catalog copy and the probe repos unless `--keep` asked to keep them. The streams
 * (`<runDir>/<id>.jsonl`) always stay, since the summary prints their folder.
 */
function cleanup(ctx, keep) {
  if (keep) return;
  rmSync(join(ctx.runDir, 'catalog'), { recursive: true, force: true });
  for (const repo of ctx.repos) rmSync(repo, { recursive: true, force: true });
}

/** Entry point: parse flags, check for `agy`, prepare the catalog, run the probes. */
function main() {
  const options = parseArgs(process.argv.slice(2));
  const version = agyVersion();
  if (version === null) {
    console.log('skip: agy not on PATH');
    return;
  }
  if (!existsSync(CLI)) die(`missing ${CLI}; run npm run build first`);

  const probes = selectProbes(PROBES, options.only);
  const runDir = mkdtempSync(join(tmpdir(), 'sigil-probe-run-'));
  const ctx = { runDir, repos: [], catalogDir: prepareCatalog(runDir), dryRun: options.dryRun };
  let bad = false;

  try {
    for (const probe of probes) {
      let outcome;
      try {
        outcome = runProbe(probe, ctx, options);
      } catch (error) {
        outcome = {
          probe,
          got: 'fail',
          mark: 'CHANGED',
          evidence: `teardown failed: ${oneLine(error.message)}`,
          failed: true,
        };
      }
      console.log(
        `${outcome.probe.id}  ${outcome.probe.adr}  expect=${outcome.probe.expect}  got=${outcome.got}  ${outcome.mark}  ${outcome.evidence}`,
      );
      if (outcome.mark === 'CHANGED' || outcome.failed) bad = true;
    }
  } finally {
    console.log(`streams: ${ctx.runDir}`);
    if (options.keep) {
      for (const repo of ctx.repos) console.log(`kept: ${repo}`);
    }
    cleanup(ctx, options.keep);
  }

  console.log(`agy ${version}, model ${options.model}`);
  process.exitCode = bad ? 1 : 0;
}

main();
