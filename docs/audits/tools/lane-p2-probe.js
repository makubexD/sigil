// Lane P2 — hardened dispatch-scoring benchmark (round 7, 2026-08-26).
//
// Lane P (docs/audits/2026-08-21/tools/lane-p-probe.js) sat at 14/14 for round 7's whole
// measurement window, but on inspection that number was not evidence of a strong catalog — it was
// evidence of a weak test: 14 probes, all TypeScript, scored only against the 26 artifacts
// installed in *this* project (not the 99 in the catalog), and a win by a 0-point margin over the
// runner-up counted as a PASS. Angular (18 artifacts) and C# (17) were never probed at all, and an
// artifact that only "won" because its real competitor wasn't installed was indistinguishable from
// one that won on merit.
//
// Lane P2 fixes all four weaknesses without changing the underlying method (bag-of-words overlap
// over description+whenToUse — the same proxy Lane P documents and justifies): it probes every
// language, scores against the WHOLE bundled catalog, requires the winner to beat the runner-up by
// a margin (a tie is a FAIL, not a PASS), and adds adversarial near-miss / cross-language-confusion
// / negative probes deliberately designed to break ties the old set never tested. The old script is
// left untouched so the round 1-7 trend line on the original 14 probes stays comparable; this is a
// stricter, additional benchmark, not a replacement.
'use strict';
const { loadCatalog } = require('./load-catalog');

const MARGIN_MIN = 1; // winner must beat runner-up by at least this many points, or it's AMBIGUOUS

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

const PROBES = [
  // ---- TypeScript (carried over concepts, re-verified against the whole catalog) ----
  {
    n: 1,
    prompt: 'Add the lodash-es package to this TypeScript project',
    expect: 'typescript/ts-add-package',
  },
  { n: 2, prompt: 'Cut a 0.9.0 npm release of this package', expect: 'typescript/ts-release' },
  {
    n: 3,
    prompt: 'Write tests for src/templates.ts',
    expect: 'typescript/ts-generate-tests',
    mustNot: 'typescript/ts-sync-tests',
  },
  {
    n: 4,
    prompt:
      'Multiple TypeScript source files changed, sync the test suite and clean up orphaned tests',
    expect: 'typescript/ts-sync-tests',
    mustNot: 'typescript/ts-generate-tests',
  },
  {
    n: 5,
    prompt: 'Review the diff I just made to src/templates.ts for bugs',
    expect: 'typescript/ts-code-reviewer',
    mustNot: 'shared/code-reviewer',
  },
  {
    n: 6,
    prompt:
      'Refactor src/templates.ts to reduce duplication, keep behavior identical, verify tests stay green',
    expect: 'typescript/ts-refactor-specialist',
    mustNot: 'typescript/ts-code-reviewer',
  },
  {
    n: 7,
    prompt: 'Are there any known CVEs in this npm project dependencies',
    expect: 'typescript/ts-audit-deps',
    mustNot: 'typescript/ts-security-auditor',
  },
  {
    n: 8,
    prompt: 'Conduct a deep codebase-wide security audit, hardcoded secrets and injection',
    expect: 'typescript/ts-security-auditor',
    mustNot: 'typescript/ts-audit-deps',
  },
  {
    n: 9,
    prompt: 'Scaffold a new npm package called sigil-metrics in this TypeScript workspace',
    expect: 'typescript/ts-scaffold-project',
  },
  {
    n: 10,
    prompt: 'Document the exported functions in src/templates.ts',
    expect: 'typescript/ts-document',
  },
  {
    n: 11,
    prompt: 'Debug why npm test is failing with a TypeScript stack trace',
    expect: 'typescript/ts-debugger',
  },
  {
    n: 12,
    prompt:
      'Is this TypeScript codebase module structure well architected, any circular dependencies',
    expect: 'typescript/ts-architecture-reviewer',
  },
  {
    n: 13,
    prompt: 'Profile src/templates.ts for performance issues, hot paths and O(n^2) loops',
    expect: 'typescript/ts-performance-profiler',
  },
  {
    n: 14,
    prompt: 'Will bumping this npm package major version break downstream TypeScript consumers',
    expect: 'typescript/ts-api-compat-reviewer',
  },
  {
    n: 15,
    prompt: 'Update the lodash dependency to the latest version',
    expect: null,
    mustNot: 'typescript/ts-add-package',
  },

  // ---- C# (untested by the old lane entirely) ----
  {
    n: 16,
    prompt: 'Add the Serilog NuGet package to this C# project, vet its license and CVEs',
    expect: 'csharp/cs-add-package',
  },
  {
    n: 17,
    prompt: 'Are there known CVEs in this .NET project NuGet dependencies',
    expect: 'csharp/cs-audit-deps',
    mustNot: 'csharp/cs-security-auditor',
  },
  {
    n: 18,
    prompt: 'Conduct a security audit of this C# codebase for hardcoded secrets and injection',
    expect: 'csharp/cs-security-auditor',
    mustNot: 'csharp/cs-audit-deps',
  },
  {
    n: 19,
    prompt: 'Review this C# diff for bugs and correctness against project conventions',
    expect: 'csharp/cs-code-reviewer',
  },
  {
    n: 20,
    prompt: 'Scaffold a new .NET solution called Sigil.Metrics',
    expect: 'csharp/cs-scaffold-project',
  },
  {
    n: 21,
    prompt: 'Debug why this xUnit test is failing with a C# stack trace',
    expect: 'csharp/cs-debugger',
  },
  {
    n: 22,
    prompt: 'Is this C# solution well architected, is the layering and coupling sound',
    expect: 'csharp/cs-architecture-reviewer',
  },
  {
    n: 23,
    prompt: 'Profile this ASP.NET Core endpoint for performance, N+1 queries and blocking calls',
    expect: 'csharp/cs-performance-profiler',
  },
  {
    n: 24,
    prompt: 'Will bumping this NuGet package major version break consumers of our public API',
    expect: 'csharp/cs-api-compat-reviewer',
  },
  { n: 25, prompt: 'Cut a new NuGet release of this C# package', expect: 'csharp/cs-release' },

  // ---- Angular (untested by the old lane entirely; includes the ng-only template-reviewer split) ----
  {
    n: 26,
    prompt:
      'Review this Angular component template for OnPush change-detection correctness and accessibility',
    expect: 'angular/ng-template-reviewer',
    mustNot: 'angular/ng-code-reviewer',
  },
  {
    n: 27,
    prompt: 'Review this Angular diff for correctness, security, and quality against conventions',
    expect: 'angular/ng-code-reviewer',
    mustNot: 'angular/ng-template-reviewer',
  },
  {
    n: 28,
    prompt: 'Add the ngx-translate package to this Angular workspace',
    expect: 'angular/ng-add-package',
  },
  {
    n: 29,
    prompt: 'Are there known CVEs in this Angular project npm dependencies',
    expect: 'angular/ng-audit-deps',
    mustNot: 'angular/ng-security-auditor',
  },
  {
    n: 30,
    prompt: 'Generate an Angular standalone component for the user profile page',
    expect: 'angular/ng-generate-component',
  },
  {
    n: 31,
    prompt: 'Debug why this Angular unit test is failing, zone.js stack trace',
    expect: 'angular/ng-debugger',
  },
  {
    n: 32,
    prompt: 'Is this Angular workspace well architected, module boundaries and coupling',
    expect: 'angular/ng-architecture-reviewer',
  },
  {
    n: 33,
    prompt: 'Profile this Angular app change-detection cycle for performance issues',
    expect: 'angular/ng-performance-profiler',
  },
  { n: 34, prompt: 'Cut a new release of this Angular library', expect: 'angular/ng-release' },
  {
    n: 35,
    prompt: 'Sync the Angular test suite, remove orphaned specs for deleted components',
    expect: 'angular/ng-sync-tests',
    mustNot: 'angular/ng-generate-tests',
  },
  {
    n: 36,
    prompt: 'Write unit tests for this Angular component that has no test coverage yet',
    expect: 'angular/ng-generate-tests',
    mustNot: 'angular/ng-sync-tests',
  },

  // ---- Shared fallback ----
  {
    n: 37,
    prompt: 'Review this Python diff for bugs and quality issues',
    expect: 'python/py-code-reviewer',
  },
  {
    n: 38,
    prompt: 'Explain the diff between these two commits in plain language',
    expect: 'shared/explain-diff',
  },
  {
    n: 39,
    prompt: 'Author a brand new catalog artifact for this project',
    expect: 'shared/author-artifact',
  },

  // ---- Cross-language confusion probes: a language-scoped mention must not top-match a sibling ----
  {
    n: 40,
    prompt: 'Review the changes I just made to src/Program.cs for bugs',
    expect: 'csharp/cs-code-reviewer',
    mustNot: 'typescript/ts-code-reviewer',
  },
  {
    n: 41,
    prompt: 'Review the changes I just made to app.component.ts for bugs',
    expect: 'angular/ng-code-reviewer',
    mustNot: 'typescript/ts-code-reviewer',
  },
  {
    n: 42,
    prompt: 'Debug why this pytest run is failing with a Python traceback',
    expect: 'python/py-debugger',
    mustNot: 'typescript/ts-debugger',
  },

  // ---- Negative probes: nothing in the catalog should claim these ----
  { n: 43, prompt: "What's the weather like today", expect: null },
  { n: 44, prompt: 'Summarize this meeting transcript into action items', expect: null },
  { n: 45, prompt: 'Translate this paragraph into French', expect: null },
];

function main() {
  const catalog = loadCatalog();
  // Score against the WHOLE bundled catalog's skills/agents — not just what happens to be
  // installed in this project. An artifact that only "wins" a probe because its real competitor
  // isn't installed is not evidence the trigger surface actually works.
  const candidates = catalog.filter(a => a.kind === 'skill' || a.kind === 'agent');

  let hits = 0;
  const results = [];
  for (const probe of PROBES) {
    const promptTokens = tokenize(probe.prompt);
    const ranked = candidates
      .map(a => ({ id: a.id, kind: a.kind, s: score(promptTokens, tokenize(triggerText(a))) }))
      .sort((a, b) => b.s - a.s);
    const top = ranked[0];
    const runnerUp = ranked[1];
    const margin = top && runnerUp ? top.s - runnerUp.s : top ? top.s : 0;
    const decisive = top && top.s > 0 && margin >= MARGIN_MIN;
    const winner = decisive ? top.id : null;

    let verdict;
    if (probe.expect === null) {
      const claimant = top && top.s > 0 ? top.id : null;
      verdict =
        claimant && (!probe.mustNot || claimant === probe.mustNot)
          ? `FAIL (fired ${claimant} on a prompt nothing should claim)`
          : 'PASS (correctly stayed quiet)';
    } else if (!decisive) {
      verdict =
        top && top.s > 0
          ? `FAIL (no decisive winner — top ${top.id}(${top.s}) vs runner-up ${runnerUp ? `${runnerUp.id}(${runnerUp.s})` : 'none'}, margin ${margin} < ${MARGIN_MIN})`
          : 'FAIL (no artifact scored above 0)';
    } else if (winner === probe.expect) {
      verdict = 'PASS';
    } else if (winner === probe.mustNot) {
      verdict = `FAIL (collision — ${probe.mustNot} outranked ${probe.expect})`;
    } else {
      verdict = `FAIL (top match: ${winner}, expected ${probe.expect})`;
    }
    if (verdict === 'PASS' || verdict.startsWith('PASS')) hits++;
    results.push({ ...probe, winner, margin, top3: ranked.slice(0, 3), verdict });
    console.log(`#${probe.n} [${verdict}] "${probe.prompt}"`);
    console.log(
      `    top3: ${ranked
        .slice(0, 3)
        .map(r => `${r.id}(${r.s})`)
        .join(', ')}`,
    );
  }
  console.log(
    `\n${hits}/${PROBES.length} probes passed (margin >= ${MARGIN_MIN}, scored vs. full catalog).`,
  );
  return results;
}

if (require.main === module) main();
module.exports = { main, PROBES };
