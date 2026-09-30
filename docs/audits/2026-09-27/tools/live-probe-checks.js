// Verdicts for live-probe.js. Every provider's event stream is first normalized to one shape
// ({ init, tools, results, final }), then each check type in ../campaign.json judges it.
// Verdicts: PASS · FAIL · PARTIAL (rule check: extras none, some expected rules not named — soft) ·
// FINDING (behaves as the catalog says, but the catalog itself looks wrong, e.g. a glob leak) ·
// INVALID (the model looked at the answer instead of receiving it) · INFO (control run) · ERROR.
'use strict';
const fs = require('fs');
const path = require('path');
const picomatch = require('picomatch');
const matter = require('gray-matter');

const parseLines = lines =>
  lines
    .map(l => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
const textOf = c =>
  typeof c === 'string'
    ? c
    : Array.isArray(c)
      ? c.map(x => x.text || '').join('\n')
      : JSON.stringify(c ?? '');

function normalizeClaude(events) {
  const n = { init: null, tools: [], results: {}, final: null, usage: [] };
  for (const e of events) {
    if (e.type === 'system' && e.subtype === 'init') n.init = e;
    const top = !e.parent_tool_use_id;
    for (const c of e.message?.content || []) {
      if (c.type === 'tool_use')
        n.tools.push({ id: c.id, name: c.name, input: c.input || {}, top });
      if (c.type === 'tool_result')
        n.results[c.tool_use_id] = { text: textOf(c.content), isError: !!c.is_error };
    }
    if (e.type === 'assistant' && e.message?.usage && top) n.usage.push(e.message.usage);
    if (e.type === 'result')
      n.final = {
        text: e.result || '',
        costUsd: e.total_cost_usd,
        denials: e.permission_denials || [],
        subtype: e.subtype,
        apiError:
          e.is_error && e.api_error_status
            ? `${e.api_error_status} ${e.result || ''}`.trim()
            : null,
      };
  }
  return n;
}

function normalizeCopilot(events) {
  const n = { init: null, tools: [], results: {}, final: null, usage: [], mcp: [] };
  let lastText = '';
  for (const e of events) {
    const d = e.data || {};
    if (e.type === 'session.mcp_servers_loaded') n.mcp = d.servers || [];
    if (e.type === 'tool.execution_start')
      n.tools.push({
        id: d.toolCallId,
        name: d.toolName,
        input: d.arguments || {},
        top: !d.parentToolCallId,
      });
    if (e.type === 'tool.execution_complete')
      n.results[d.toolCallId] = {
        text: textOf(d.result?.content ?? d.result ?? d.error),
        isError: d.success === false,
      };
    if (e.type === 'assistant.message' && d.content) lastText = d.content;
    if (e.type === 'session.usage_checkpoint') n.premium = d.totalPremiumRequests;
    if (d.model && !n.model) n.model = d.model;
  }
  n.final = { text: lastText, denials: [] };
  return n;
}

const normalize = (provider, lines) =>
  (provider === 'claude' ? normalizeClaude : normalizeCopilot)(parseLines(lines));

/** Sonnet-class list prices, only for runs killed before their `result` event reported a cost. */
function estimateUsd(usage) {
  const t = usage.reduce(
    (a, u) => ({
      in: a.in + (u.input_tokens || 0),
      out: a.out + (u.output_tokens || 0),
      cw: a.cw + (u.cache_creation_input_tokens || 0),
      cr: a.cr + (u.cache_read_input_tokens || 0),
    }),
    { in: 0, out: 0, cw: 0, cr: 0 },
  );
  return (t.in * 3 + t.out * 15 + t.cw * 3.75 + t.cr * 0.3) / 1e6;
}

const TOOL_KINDS = {
  claude: {
    skill: /^Skill$/,
    agent: /^(Agent|Task)$/,
    bash: /^(Bash|PowerShell)$/,
    write: /^(Write|Edit|MultiEdit)$/,
  },
  copilot: {
    skill: /skill/i,
    agent: /^(task|agent)|agent$/i,
    bash: /^(bash|powershell|shell)/i,
    write: /^(create|edit|write)/i,
  },
};
const inputStr = t => JSON.stringify(t.input);
/** Copilot loads a skill by viewing its SKILL.md; that counts as dispatch for the skill check. */
const viewedPaths = n =>
  n.tools
    .filter(t => /^view$/i.test(t.name))
    .map(t => String(t.input.path || '').replace(/\\/g, '/'));

function dispatched(provider, n, kind) {
  const re = TOOL_KINDS[provider][kind];
  const calls = n.tools
    .filter(t => t.top && re.test(t.name))
    .map(t => ({ via: t.name, target: dispatchTarget(t), tool: t }));
  if (provider === 'copilot' && kind === 'skill')
    for (const p of viewedPaths(n)) {
      const m = p.match(/\.github\/skills\/([^/]+)\/SKILL\.md$/i);
      if (m) calls.push({ via: 'view', target: m[1] });
    }
  return calls;
}
const dispatchTarget = t =>
  t.input.skill ||
  t.input.subagent_type ||
  t.input.agent_type ||
  t.input.name ||
  t.input.agent ||
  inputStr(t).slice(0, 120);

judgeDispatch.early = true;
function judgeDispatch(provider, probe, n) {
  const calls = dispatched(provider, n, probe.check.tool);
  if (!calls.length)
    return {
      verdict: probe.check.soft ? 'FINDING' : 'FAIL',
      evidence: `no ${probe.check.tool} dispatched; answered directly`,
    };
  const re = new RegExp(probe.check.expect, 'i');
  const hit = calls.find(c => re.test(c.target));
  return hit
    ? { verdict: 'PASS', evidence: `${hit.via} → ${hit.target}` }
    : {
        verdict: 'FAIL',
        evidence: `dispatched ${calls.map(c => c.target).join(', ')}; expected /${probe.check.expect}/`,
      };
}

// ---- installed-file helpers (what sigil wrote into the target) ----
const rel = (target, p) => path.relative(target, path.resolve(target, p)).replace(/\\/g, '/');
function listDir(dir, filter) {
  try {
    return fs.readdirSync(dir).filter(filter);
  } catch {
    return [];
  }
}
function installedNames(provider, target) {
  const base = provider === 'claude' ? '.claude' : '.github';
  const agents = listDir(path.join(target, base, 'agents'), f => f.endsWith('.md')).map(f =>
    f.replace(/(\.agent)?\.md$/, ''),
  );
  const skills = listDir(path.join(target, base, 'skills'), f =>
    fs.existsSync(path.join(target, base, 'skills', f, 'SKILL.md')),
  );
  return { agents, skills };
}

/** Every rule/instruction file sigil installed, with the globs that make it load (none = always). */
function installedRules(provider, target) {
  const dir =
    provider === 'claude'
      ? path.join(target, '.claude', 'rules')
      : path.join(target, '.github', 'instructions');
  const rules = listDir(dir, f => f.endsWith('.md')).map(f => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const fm = matter(raw).data;
    const globs =
      provider === 'claude'
        ? fm.paths || []
        : String(fm.applyTo || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
    return { rel: rel(target, path.join(dir, f)), globs, raw };
  });
  for (const always of ['.github/copilot-instructions.md', 'AGENTS.md'].filter(
    () => provider === 'copilot',
  ))
    if (fs.existsSync(path.join(target, always)))
      rules.push({
        rel: always,
        globs: [],
        raw: fs.readFileSync(path.join(target, always), 'utf8'),
      });
  return rules;
}
function expectedRules(provider, target, file) {
  return installedRules(provider, target).filter(
    r => !r.globs.length || picomatch(r.globs, { dot: true })(file),
  );
}

const squash = s =>
  s
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

function judgeRules(provider, probe, n, env) {
  const rules = installedRules(provider, env.target);
  const byRel = new Map(rules.map(r => [r.rel, r]));
  const peeked = n.tools.some(
    t =>
      t.top &&
      !/^view$/i.test(t.name) &&
      /\.claude[\\/]+rules|\.github[\\/]+instructions/.test(inputStr(t)),
  );
  if (provider === 'claude' && peeked)
    return { verdict: 'INVALID', evidence: 'model opened the rules folder itself' };
  const loaded = new Set();
  const unverified = [];
  for (const [, p, quote] of n.final.text.matchAll(/<rule path="([^"]+)">([\s\S]*?)<\/rule>/g)) {
    const r = byRel.get(rel(env.target, p));
    if (r && squash(quote).length >= 15 && squash(r.raw).includes(squash(quote))) loaded.add(r.rel);
    else unverified.push(p);
  }
  if (provider === 'copilot')
    for (const p of viewedPaths(n)) {
      const r = byRel.get(rel(env.target, p));
      if (r) loaded.add(r.rel);
    }
  const expected = new Set(expectedRules(provider, env.target, probe.file).map(r => r.rel));
  const extra = [...loaded].filter(r => !expected.has(r));
  const missing = [...expected].filter(r => !loaded.has(r));
  const foreignRe =
    probe.check.foreign && new RegExp(`(^|[-_/])(${probe.check.foreign.join('|')})`);
  const foreign = foreignRe ? [...loaded].filter(r => foreignRe.test(path.basename(r))) : [];
  const short = a => a.map(r => path.basename(r).replace(/(\.instructions)?\.md$/, '')).join(' ');
  const details = {
    loaded: [...loaded],
    expected: [...expected],
    extra,
    missing,
    foreign,
    unverified,
  };
  if (extra.length)
    return { verdict: 'FAIL', evidence: `loaded outside its globs: ${short(extra)}`, details };
  if (foreign.length)
    return {
      verdict: 'FINDING',
      evidence: `foreign rules load on ${probe.file}: ${short(foreign)}`,
      details,
    };
  if (!loaded.size && expected.size)
    return { verdict: 'FAIL', evidence: `none of ${expected.size} expected rules named`, details };
  if (missing.length)
    return {
      verdict: 'PARTIAL',
      evidence: `${loaded.size}/${expected.size} named; missing ${short(missing)}`,
      details,
    };
  return {
    verdict: 'PASS',
    evidence: `${loaded.size}/${expected.size} rules: ${short([...loaded])}`,
    details,
  };
}

function judgeInventory(provider, probe, n, env) {
  const want = installedNames(provider, env.target);
  const have =
    provider === 'claude' && n.init
      ? { agents: n.init.agents || [], skills: n.init.skills || [] }
      : {
          agents: [...n.final.text.matchAll(/agent:\s*([\w.-]+)/gi)].map(m => m[1]),
          skills: [...n.final.text.matchAll(/skill:\s*([\w.-]+)/gi)].map(m => m[1]),
        };
  const miss = [
    ...want.agents.filter(a => !have.agents.includes(a)),
    ...want.skills.filter(s => !have.skills.includes(s)),
  ];
  const evidence = `${want.agents.length} agents, ${want.skills.length} skills installed`;
  return miss.length
    ? { verdict: 'FAIL', evidence: `${evidence}; not seen: ${miss.join(' ')}` }
    : { verdict: 'PASS', evidence: `${evidence}; all seen` };
}

function judgeHook(provider, probe, n, env) {
  const writes = n.tools.filter(t => t.top && TOOL_KINDS[provider].write.test(t.name));
  if (!writes.length) return { verdict: 'FAIL', evidence: 'no write attempted' };
  const blocked = writes.some(t => /sigil-hook: blocked/.test(n.results[t.id]?.text || ''));
  const exists = fs.existsSync(path.join(env.target, probe.check.file));
  if (blocked && !exists)
    return { verdict: 'PASS', evidence: `blocked; ${probe.check.file} absent` };
  return { verdict: 'FAIL', evidence: `blocked=${blocked}, file exists=${exists}` };
}

function judgeFileWritten(provider, probe, n, env) {
  const exists = fs.existsSync(path.join(env.target, probe.check.file));
  return {
    verdict: exists ? 'PASS' : 'FAIL',
    evidence: `${probe.check.file} ${exists ? 'written' : 'missing'}`,
  };
}

function judgeBash(provider, probe, n) {
  const call = n.tools.find(
    t => t.top && TOOL_KINDS[provider].bash.test(t.name) && /npm run probe/.test(inputStr(t)),
  );
  if (!call) return { verdict: 'FAIL', evidence: 'no shell call to npm run probe' };
  const res = n.results[call.id] || { text: '', isError: true };
  const denied =
    n.final.denials.some(d => d.tool_use_id === call.id || d.tool_name === call.name) ||
    (res.isError && /permission|denied|not allowed|approv/i.test(res.text));
  const allowed = !denied; // a failing script still ran
  const ok = allowed === probe.check.allowed;
  return {
    verdict: ok ? 'PASS' : 'FAIL',
    evidence: `${call.name}: ${allowed ? 'ran' : 'denied'} (expected ${probe.check.allowed ? 'ran' : 'denied'})`,
  };
}

function judgeRecall(provider, probe, n, env) {
  const calls = dispatched(provider, n, 'agent').filter(c =>
    new RegExp(probe.check.agent, 'i').test(c.target),
  );
  if (!calls.length) return { verdict: 'FAIL', evidence: `agent ${probe.check.agent} never ran` };
  const text = [...calls.map(c => n.results[c.tool?.id]?.text || ''), n.final.text].join('\n');
  const defects = JSON.parse(fs.readFileSync(path.join(env.fixture, 'defects.json'), 'utf8'));
  const found = defects.filter(d => d.any.some(re => new RegExp(re, 'i').test(text)));
  const missed = defects.filter(d => !found.includes(d)).map(d => d.id);
  const score = found.length / defects.length;
  return {
    verdict: score >= probe.check.min ? 'PASS' : 'FAIL',
    evidence: `recall ${found.length}/${defects.length}${missed.length ? `; missed ${missed.join(' ')}` : ''}`,
    details: { score, missed },
  };
}

function judgeDiff(provider, probe, n, env) {
  env.git('add', '-A');
  const added = env
    .git('diff', '--cached', '-U0')
    .split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++'))
    .join('\n');
  if (!added)
    return { verdict: probe.check.control ? 'INFO' : 'FAIL', evidence: 'no change written' };
  const broken = (probe.check.mustNot || []).filter(re => new RegExp(re, 'm').test(added));
  const absent = (probe.check.must || []).filter(re => !new RegExp(re, 'im').test(added));
  const bad = [...broken.map(r => `has /${r}/`), ...absent.map(r => `lacks /${r}/`)];
  const verdict = probe.check.control ? 'INFO' : bad.length ? 'FAIL' : 'PASS';
  return {
    verdict,
    evidence: bad.length ? bad.join('; ') : 'follows every checked rule',
    details: { violations: bad },
  };
}

function judgeCommand(provider, probe, n) {
  const text = n.final.text;
  if (/unknown (skill|command)|isn't available|not found/i.test(text))
    return { verdict: 'FAIL', evidence: 'command not recognized' };
  const usedFile = provider === 'claude' || viewedPaths(n).some(p => /\.github\/prompts\//.test(p));
  const answered = new RegExp(probe.check.expect, 'i').test(text);
  if (!answered) return { verdict: 'FAIL', evidence: 'answer misses the point of the diff' };
  return usedFile
    ? { verdict: 'PASS', evidence: 'ran and explained the diff' }
    : { verdict: 'FINDING', evidence: 'answered without opening the prompt file' };
}

function judgeMcp(provider, probe, n) {
  const servers = provider === 'claude' ? n.init?.mcp_servers || [] : n.mcp || [];
  const s = servers.find(x => x.name === probe.check.server);
  if (!s)
    return {
      verdict: 'FAIL',
      evidence: `server ${probe.check.server} not loaded (have: ${servers.map(x => x.name).join(', ') || 'none'})`,
    };
  const calls = n.tools.filter(t => t.name.includes(probe.check.server));
  const ok = calls.find(t => !n.results[t.id]?.isError);
  if (ok) return { verdict: 'PASS', evidence: `${s.status}; ${ok.name} ok` };
  // Connected and callable, but the install grants no permission: headless use is refused and an
  // interactive user gets a prompt. A catalog decision, not a load failure.
  const needsGrant = calls.some(t =>
    /permission|haven't granted|approv/i.test(n.results[t.id]?.text || ''),
  );
  return needsGrant
    ? {
        verdict: 'FINDING',
        evidence: `server ${s.status}; ${calls[0].name} needs a permission grant the install doesn't give`,
      }
    : { verdict: 'FAIL', evidence: `server ${s.status}; no successful tool call` };
}

const CHECKS = {
  dispatch: judgeDispatch,
  rules: judgeRules,
  inventory: judgeInventory,
  hookBlock: judgeHook,
  fileWritten: judgeFileWritten,
  bash: judgeBash,
  recall: judgeRecall,
  diff: judgeDiff,
  command: judgeCommand,
  mcp: judgeMcp,
};

function judge(provider, probe, out, env) {
  const n = normalize(provider, out.lines);
  const cost = {
    costUsd: n.final?.costUsd,
    estUsd: n.final?.costUsd == null && n.usage.length ? estimateUsd(n.usage) : undefined,
    premium: n.premium,
    model: n.model || n.init?.model,
  };
  if (!out.lines.length)
    return {
      verdict: 'ERROR',
      fatal: true,
      evidence: `no output (exit ${out.code}): ${out.stderr.slice(0, 200)}`,
      ...cost,
    };
  if (n.final?.apiError)
    return {
      verdict: 'ERROR',
      fatal: true,
      evidence: `API error ${n.final.apiError}`.slice(0, 200),
      ...cost,
    };
  try {
    return { ...CHECKS[probe.check.type](provider, probe, n, env), ...cost };
  } catch (err) {
    return { verdict: 'ERROR', evidence: err.message, ...cost };
  }
}

/** Kill a dispatch probe once its first skill/agent call arrives; inventory once init is in. */
judge.stopEarly = (provider, probe, lines) => {
  const n = normalize(provider, lines);
  if (probe.check.type === 'dispatch') return dispatched(provider, n, probe.check.tool).length > 0;
  if (probe.check.type === 'inventory') return !!n.init;
  return false;
};

module.exports = { judge, expectedRules, normalize };
