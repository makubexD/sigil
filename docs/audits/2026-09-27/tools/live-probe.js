// Live-prompt campaign: do installed catalog artifacts actually change what Claude Code / Copilot do?
//
// Method: for each combination in ../campaign.json the target folder (default
// C:\WorkspaceMaku\TestCaI, override with PROBE_TARGET) is wiped, the combination is installed with
// `sigil add`, a small legacy fixture (../fixtures/<K>, with seeded defects in defects.json) is
// copied in and committed as a baseline, then each probe sends one real prompt through
// `claude -p --output-format stream-json` or `copilot -p --output-format json`, and the event
// stream is judged by live-probe-checks.js. The target is reset to the baseline between probes.
//
// This is the live replay the lane-p/p2 keyword proxies (docs/audits/**/lane-p*-probe.js) never
// did. What the T0 spike (2026-09-27) established about the signals:
//   - Claude's init event lists the skills, agents, slash commands and MCP servers it loaded;
//     `--setting-sources project,local` keeps the user's own plugins, hooks and agents out.
//   - A path-scoped rule's text reaches the model outside the event stream (not in stream-json,
//     not in --debug-file), so rule loading is judged by a verifiable self-report: the model names
//     each attached rule file and copies one sentence from it, and the sentence must occur in that
//     file. A rule it names is hard evidence; a rule it omits is soft (it may just have skipped it).
//   - Copilot CLI loads an applyTo instruction file by opening it with its `view` tool, so a view
//     of a matching instruction file counts as loaded there.
//
// Costs money (every probe is a real model call), so it is manual and never part of `npm test`.
// Usage:  node live-probe.js [--provider claude|copilot|all] [--only K1,K2:P7] [--max-usd 40] [--repeat N]
//         node live-probe.js --dry          (build every fixture, print expected rules, no model calls)
//         node live-probe.js --rejudge <run> [--only K1:P4]  (re-judge saved transcripts; stream-only checks)
//         node live-probe-report.js         (render ../live-probe-report.md from ../results/*.jsonl)
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { loadCatalog } = require('../../tools/load-catalog');
const { judge, expectedRules } = require('./live-probe-checks');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const HERE = path.resolve(__dirname, '..');
const TARGET = process.env.PROBE_TARGET || 'C:\\WorkspaceMaku\\TestCaI';
const CAMPAIGN = JSON.parse(fs.readFileSync(path.join(HERE, 'campaign.json'), 'utf8'));
const D = CAMPAIGN.defaults;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}
const flag = name => process.argv.includes(name);

/** "K1,K2:P7" → { K1: null (all probes), K2: Set{P7} } */
function parseOnly(spec) {
  if (!spec) return null;
  const only = {};
  for (const part of spec.split(',')) {
    const [k, p] = part.split(':');
    if (!p) only[k] = null;
    else if (only[k] !== null) (only[k] = only[k] || new Set()).add(p);
  }
  return only;
}

function git(...args) {
  return cp.execFileSync('git', args, {
    cwd: TARGET,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function wipeTarget() {
  if (!process.env.PROBE_TARGET && path.basename(TARGET) !== 'TestCaI')
    throw new Error(`refusing to wipe ${TARGET}: not the TestCaI target`);
  fs.mkdirSync(TARGET, { recursive: true });
  for (const name of fs.readdirSync(TARGET)) {
    const p = path.join(TARGET, name);
    try {
      fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      cp.execSync(`cmd /c rd /s /q "${p}"`); // read-only git objects on Windows
    }
  }
}

/** Expands a combination to exact catalog selectors: every artifact of its languages + named ids. */
function selectorsFor(combo) {
  const ids = [...(combo.ids || [])];
  if (combo.languages?.length) {
    for (const a of loadCatalog()) {
      const lang = a.id.split('/')[0];
      if (!combo.languages.includes(lang) || a.frontmatter.deprecated) continue;
      if (['skill', 'agent', 'rule', 'prompt'].includes(a.kind)) ids.push(`${a.kind}:${a.id}`);
    }
  }
  return ids;
}

function setupCombo(combo, provider, variant) {
  wipeTarget();
  git('init', '-q');
  git('config', 'user.email', 'probe@example.com');
  git('config', 'user.name', 'probe');
  const target = provider === 'copilot' ? 'copilot' : 'claude';
  const cli = path.join(REPO, 'dist-cli', 'cli.js');
  const addArgs = [
    cli,
    'add',
    ...selectorsFor(combo),
    '--target',
    target,
    '--yes',
    '--scope',
    'project',
  ];
  cp.execFileSync(process.execPath, [...addArgs, '--project-dir', TARGET], { stdio: 'pipe' });
  fs.cpSync(path.join(HERE, 'fixtures', combo.fixture), TARGET, { recursive: true });
  fs.rmSync(path.join(TARGET, 'defects.json'), { force: true });
  if (variant === 'strip-rules') {
    fs.rmSync(path.join(TARGET, '.claude', 'rules'), { recursive: true, force: true });
    fs.rmSync(path.join(TARGET, '.github', 'instructions'), { recursive: true, force: true });
  }
  git('add', '-A');
  git('commit', '-q', '-m', `baseline ${combo.id} ${provider} ${variant || ''}`);
}

function resetToBaseline() {
  git('reset', '--hard', '-q');
  git('clean', '-fdq');
}

/** Expands @rules / @P5 / @logEdit shorthands in a probe prompt. */
function promptFor(probe, combo) {
  if (probe.prompt === '@rules') return CAMPAIGN.prompts.rules.replace('{file}', probe.file);
  if (probe.prompt === undefined && probe.check.type === 'inventory')
    return CAMPAIGN.prompts.inventory;
  let text = probe.prompt;
  if (text.startsWith('@P')) text = combo.probes.find(p => p.id === text.slice(1)).prompt;
  return text.replace('@logEdit', CAMPAIGN.prompts.logEdit);
}

function commandFor(provider, probe, prompt) {
  if (provider === 'claude') {
    const args = [
      '-p',
      prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--no-session-persistence',
      '--setting-sources',
      'project,local',
      '--model',
      D.claudeModel,
      '--effort',
      probe.effort || 'low',
      '--max-turns',
      String(probe.maxTurns || 3),
      '--max-budget-usd',
      String(probe.maxUsd || D.maxUsdPerCall),
    ];
    if (probe.permission) args.push('--permission-mode', probe.permission);
    return { exe: 'claude', args };
  }
  const args = [
    '-p',
    prompt,
    '--output-format',
    'json',
    '--allow-all-tools',
    '--no-ask-user',
    '--disable-builtin-mcps',
    '--disable-mcp-server',
    'context-mode',
    '--no-auto-update',
    ...(D.copilotModel ? ['--model', D.copilotModel] : []),
    ...(D.copilotAutoTier ? ['--model', 'auto', '--auto-tier', D.copilotAutoTier] : []),
  ];
  return { exe: 'copilot', args };
}

function killTree(pid) {
  try {
    cp.execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
  } catch {
    /* already gone */
  }
}

/** Runs one CLI call, streaming JSON lines to `raw`; resolves when it exits, times out, or stopEarly(). */
function runCli(provider, probe, prompt, rawPath, stopEarly) {
  const { exe, args } = commandFor(provider, probe, prompt);
  return new Promise(resolve => {
    const started = Date.now();
    const proc = cp.spawn(exe, args, { cwd: TARGET, windowsHide: true });
    const lines = [];
    let buf = '';
    let killed = null;
    const timer = setTimeout(
      () => ((killed = 'timeout'), killTree(proc.pid)),
      (probe.timeoutSec || D.timeoutSec) * 1000,
    );
    proc.stdout.on('data', chunk => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        lines.push(line);
        if (!killed && stopEarly(lines)) ((killed = 'early'), killTree(proc.pid));
      }
    });
    let stderr = '';
    proc.stderr.on('data', c => (stderr += c));
    proc.on('close', code => {
      clearTimeout(timer);
      fs.writeFileSync(rawPath, lines.join('\n') + '\n');
      resolve({ lines, code, killed, stderr: stderr.slice(0, 2000), ms: Date.now() - started });
    });
  });
}

async function runProbe(ctx, combo, probe, attempt) {
  const prompt = promptFor(probe, combo);
  const rawDir = path.join(ctx.runDir, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  const rawPath = path.join(rawDir, `${ctx.provider}-${combo.id}-${probe.id}-a${attempt}.jsonl`);
  const stops = probe.early || (ctx.provider === 'claude' && probe.check.type === 'inventory');
  const early = stops ? lines => judge.stopEarly(ctx.provider, probe, lines) : () => false;
  const out = await runCli(ctx.provider, probe, prompt, rawPath, early);
  const result = judge(ctx.provider, probe, out, {
    target: TARGET,
    git,
    fixture: path.join(HERE, 'fixtures', combo.fixture),
  });
  return {
    ...result,
    killed: out.killed,
    exitCode: out.code,
    ms: out.ms,
    stderr: out.code ? out.stderr : undefined,
    transcript: path.relative(HERE, rawPath).replace(/\\/g, '/'),
  };
}

function record(ctx, row) {
  const line = { run: ctx.run, provider: ctx.provider, ...row, at: new Date().toISOString() };
  fs.appendFileSync(path.join(HERE, 'results', `${ctx.run}.jsonl`), JSON.stringify(line) + '\n');
  const cost =
    row.costUsd != null
      ? ` $${row.costUsd.toFixed(3)}`
      : row.estUsd != null
        ? ` ~$${row.estUsd.toFixed(3)}`
        : row.premium != null
          ? ` ${row.premium} req`
          : '';
  console.log(
    `  ${row.verdict.padEnd(8)} ${row.combo}:${row.probe}${row.rep ? ` #${row.rep}` : ''}${row.attempt > 1 ? ' (retry)' : ''}${cost}  ${row.evidence}`,
  );
}

const probesFor = (combo, provider, only) =>
  combo.probes.filter(
    p =>
      (p.providers || combo.providers).includes(provider) &&
      (!only?.[combo.id] || only[combo.id].has(p.id)),
  );

async function runCombo(ctx, combo, only) {
  const probes = probesFor(combo, ctx.provider, only);
  let variant;
  for (const probe of probes) {
    if (variant === undefined || (probe.variant || null) !== variant) {
      variant = probe.variant || null;
      setupCombo(combo, ctx.provider, variant);
      console.log(`[${ctx.provider}] ${combo.id}${variant ? ` (${variant})` : ''}: ${combo.why}`);
    }
    for (let rep = 1; rep <= ctx.repeat; rep++)
      if ((await runAttempts(ctx, combo, probe, rep)) === 'stop') return;
  }
}

/** One probe run; retried once on a miss unless repeating (a retry would inflate k/N). */
async function runAttempts(ctx, combo, probe, rep) {
  const tries = ctx.repeat > 1 ? 1 : 2;
  for (let attempt = 1; attempt <= tries; attempt++) {
    if (ctx.spent >= ctx.maxUsd) {
      console.log(`  budget cap $${ctx.maxUsd} reached — stopping`);
      return 'stop';
    }
    resetToBaseline();
    const tag = ctx.repeat > 1 ? rep : attempt;
    const row = { combo: combo.id, probe: probe.id, attempt, ...(ctx.repeat > 1 && { rep }) };
    Object.assign(row, await runProbe(ctx, combo, probe, tag));
    ctx.spent += row.costUsd || row.estUsd || 0;
    record(ctx, row);
    if (row.fatal) {
      ctx.aborted = true;
      console.log(
        '  provider or API error — stopping this provider; fix it and re-run with --only',
      );
      return 'stop';
    }
    if (!['FAIL', 'ERROR', 'INVALID'].includes(row.verdict)) return;
  }
}

function dryRun(only) {
  for (const combo of CAMPAIGN.combos.filter(c => !only || c.id in only)) {
    for (const provider of combo.providers) {
      setupCombo(combo, provider, null);
      console.log(`[${provider}] ${combo.id}: ${selectorsFor(combo).length} selectors`);
      for (const p of probesFor(combo, provider, only).filter(p => p.check.type === 'rules'))
        console.log(
          `  ${p.id} ${p.file} → ${expectedRules(provider, TARGET, p.file)
            .map(r => r.rel)
            .join(', ')}`,
        );
    }
  }
}

/** Checks that read only the event stream, so a saved transcript can be judged again for free. */
const STREAM_ONLY = new Set(['dispatch', 'recall', 'bash', 'mcp', 'command']);

/** Re-judges the newest saved transcript of each matching probe (after fixing a check, not the CLI). */
function rejudge(run, only, providers) {
  const rawDir = path.join(HERE, 'results', run, 'raw');
  const ctx = { run, provider: null };
  for (const provider of providers)
    for (const combo of CAMPAIGN.combos.filter(c => !only || c.id in only))
      for (const probe of probesFor(combo, provider, only).filter(p =>
        STREAM_ONLY.has(p.check.type),
      )) {
        const files = listRaw(rawDir, `${provider}-${combo.id}-${probe.id}-a`);
        if (!files.length) continue;
        const lines = fs.readFileSync(files.at(-1), 'utf8').split('\n').filter(Boolean);
        const out = { lines, code: 0, stderr: '' };
        const env = { target: TARGET, git, fixture: path.join(HERE, 'fixtures', combo.fixture) };
        const { costUsd, estUsd, premium, ...verdict } = judge(provider, probe, out, env);
        const transcript = path.relative(HERE, files.at(-1)).replace(/\\/g, '/');
        record(Object.assign(ctx, { provider }), {
          combo: combo.id,
          probe: probe.id,
          attempt: 'rejudged',
          ...verdict,
          transcript,
        });
      }
}
const listRaw = (dir, prefix) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter(f => f.startsWith(prefix))
        .sort()
        .map(f => path.join(dir, f))
    : [];

async function main() {
  const only = parseOnly(arg('--only'));
  if (!fs.existsSync(path.join(REPO, 'dist-cli', 'cli.js')))
    throw new Error('run `npm run build` first');
  if (flag('--dry')) return dryRun(only);
  if (arg('--rejudge'))
    return rejudge(
      arg('--rejudge'),
      only,
      arg('--provider', 'all') === 'all' ? ['claude', 'copilot'] : [arg('--provider')],
    );
  const run = arg('--run', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'));
  const providers =
    arg('--provider', 'all') === 'all' ? ['claude', 'copilot'] : [arg('--provider')];
  fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
  const ctx = {
    run,
    runDir: path.join(HERE, 'results', run),
    maxUsd: Number(arg('--max-usd', 40)),
    repeat: Math.max(1, Number(arg('--repeat', 1))),
    spent: 0,
  };
  for (const provider of providers) {
    ctx.aborted = false;
    for (const combo of CAMPAIGN.combos.filter(
      c => c.providers.includes(provider) && (!only || c.id in only),
    ))
      if (!ctx.aborted) await runCombo(Object.assign(ctx, { provider }), combo, only);
  }
  console.log(
    `\nrun ${run}: ~$${ctx.spent.toFixed(2)} Claude spend. Results: docs/audits/2026-09-27/results/${run}.jsonl`,
  );
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
