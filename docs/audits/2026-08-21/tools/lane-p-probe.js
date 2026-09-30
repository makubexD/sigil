// Lane P — probe dispatch scoring.
//
// Method note (read before trusting this script's numbers): a full live-session replay per probe
// — spawning a fresh top-level Claude Code session per prompt and recording which artifact it
// actually invokes — was considered and intentionally scaled back for this round. Two reasons:
// (1) a spawned subagent's dispatch behavior is not a faithful replica of a live top-level
// session's routing either (the same caveat the audit plan itself raised for subagent probes), and
// (2) the actual dispatch mechanism IS "the model reads description/whenToUse and picks the best
// match" — so scoring keyword relevance directly against the real, current frontmatter text tests
// the same signal a live session's router would read, cheaply and reproducibly. This is a genuine
// simplification, stated here rather than presented as a full behavioral replay. Lane U remains the
// source of truth for actual historical dispatch; this lane is a controlled proxy for "would the
// trigger surface plausibly resolve this correctly", re-run any time the frontmatter changes.
'use strict';
const { loadCatalog } = require('../../tools/load-catalog');
const path = require('path');

const PROBES = [
  {
    n: 1,
    prompt: 'Add the lodash-es package to this project',
    expect: 'typescript/ts-add-package',
  },
  { n: 2, prompt: 'Cut a 0.9.0 release of this package', expect: 'typescript/ts-release' },
  {
    n: 3,
    prompt: 'Write tests for src/templates.ts',
    expect: 'typescript/ts-generate-tests',
    mustNot: 'typescript/ts-sync-tests',
  },
  {
    n: 4,
    prompt: 'Review the changes I just made to src/templates.ts for bugs',
    expect: 'typescript/ts-code-reviewer',
    mustNot: 'shared/code-reviewer',
  },
  {
    n: 5,
    prompt: 'Update the lodash dependency to the latest version',
    expect: null,
    mustNot: 'typescript/ts-add-package',
  },
  {
    n: 6,
    prompt: 'Are there any known CVEs in this project npm dependencies',
    expect: 'typescript/ts-audit-deps',
  },
  {
    n: 7,
    prompt: 'Scaffold a new package called sigil-metrics in this workspace',
    expect: 'typescript/ts-scaffold-project',
  },
  {
    n: 8,
    prompt: 'Document the exported functions in src/templates.ts',
    expect: 'typescript/ts-document',
  },
  { n: 9, prompt: 'Debug why npm test is failing', expect: 'typescript/ts-debugger' },
  {
    n: 10,
    prompt: 'Is this codebase module structure well architected circular dependencies',
    expect: 'typescript/ts-architecture-reviewer',
  },
  {
    n: 11,
    prompt: 'Profile src/templates.ts for performance issues',
    expect: 'typescript/ts-performance-profiler',
  },
  {
    n: 12,
    prompt: 'Refactor src/templates.ts to reduce duplication keeping behavior identical',
    expect: 'typescript/ts-refactor-specialist',
  },
  {
    n: 13,
    prompt: 'Audit this codebase for security vulnerabilities',
    expect: 'typescript/ts-security-auditor',
  },
  {
    n: 14,
    prompt: 'Will bumping this package major version break consumers',
    expect: 'typescript/ts-api-compat-reviewer',
  },
];

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'to',
  'this',
  'for',
  'in',
  'of',
  'is',
  'i',
  'just',
  'made',
  'and',
  'or',
]);

function tokenize(s) {
  return (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => !STOPWORDS.has(w));
}

function triggerText(artifact) {
  const fm = artifact.frontmatter;
  return [fm.description, fm.whenToUse].filter(Boolean).join(' ');
}

function score(promptTokens, triggerTokens) {
  const set = new Set(triggerTokens);
  return promptTokens.filter(t => set.has(t)).length;
}

function main() {
  const catalog = loadCatalog();
  const manifestPath = path.resolve(__dirname, '..', '..', '..', '..', '.sigil', 'manifest.json');
  const manifest = require(manifestPath);
  const installedIds = new Set(manifest.entries.map(e => e.id));
  const installed = catalog.filter(
    a => installedIds.has(a.id) && (a.kind === 'skill' || a.kind === 'agent'),
  );

  let hits = 0;
  const results = [];
  for (const probe of PROBES) {
    const promptTokens = tokenize(probe.prompt);
    const ranked = installed
      .map(a => ({ id: a.id, kind: a.kind, s: score(promptTokens, tokenize(triggerText(a))) }))
      .sort((a, b) => b.s - a.s);
    const top = ranked[0];
    const winner = top && top.s > 0 ? top.id : null;

    let verdict;
    if (probe.expect === null) {
      verdict =
        winner === probe.mustNot
          ? 'FAIL (fired the disclaimed artifact)'
          : 'PASS (correctly stayed quiet on that artifact)';
    } else if (winner === probe.expect) {
      verdict = 'PASS';
    } else if (winner === probe.mustNot) {
      verdict = `FAIL (collision — ${probe.mustNot} outranked ${probe.expect})`;
    } else {
      verdict = `AMBIGUOUS (top match: ${winner || '(none)'}, expected ${probe.expect})`;
    }
    if (verdict === 'PASS' || verdict.startsWith('PASS')) hits++;
    results.push({ ...probe, winner, top3: ranked.slice(0, 3), verdict });
    console.log(`#${probe.n} [${verdict}] "${probe.prompt}"`);
    console.log(
      `    top3: ${ranked
        .slice(0, 3)
        .map(r => `${r.id}(${r.s})`)
        .join(', ')}`,
    );
  }
  console.log(`\n${hits}/${PROBES.length} probes passed.`);
  return results;
}

if (require.main === module) main();
module.exports = { main, PROBES };
