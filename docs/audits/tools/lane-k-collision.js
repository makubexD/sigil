// Lane K — pairwise trigger-collision matrix (round 7, 2026-08-26).
//
// Lane P2's near-tie failures (docs/audits/tools/lane-p2-probe.js) are a symptom; this lane
// measures the underlying cause directly: for every pair of skill/agent artifacts, how much do
// their description+whenToUse token sets overlap? A high-Jaccard pair is two artifacts competing
// for the same dispatch signal — differentiating their wording (or accepting the overlap as
// inherent to two genuinely similar per-language siblings) is the fix, not the probe.
//
// Not part of the shipped CLI — audit tooling only, re-run any time frontmatter changes.
'use strict';
const { loadCatalog } = require('./load-catalog');

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
  'use',
  'proactively',
]);

function tokenize(s) {
  return new Set((s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => !STOPWORDS.has(w)));
}

function triggerTokens(artifact) {
  const fm = artifact.frontmatter;
  return tokenize([fm.description, fm.whenToUse].filter(Boolean).join(' '));
}

function jaccard(a, b) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

const TOP_N = 25;
const MIN_SCORE = 0.3;

function main() {
  const catalog = loadCatalog();
  const candidates = catalog.filter(a => a.kind === 'skill' || a.kind === 'agent');
  const tokensById = new Map(candidates.map(a => [a.id, triggerTokens(a)]));

  const pairs = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      const score = jaccard(tokensById.get(a.id), tokensById.get(b.id));
      if (score >= MIN_SCORE) pairs.push({ a: a.id, b: b.id, score });
    }
  }
  pairs.sort((x, y) => y.score - x.score);

  console.log(
    `Top ${Math.min(TOP_N, pairs.length)} trigger-collision pairs (Jaccard >= ${MIN_SCORE}):\n`,
  );
  for (const p of pairs.slice(0, TOP_N)) {
    console.log(`  ${p.score.toFixed(2)}  ${p.a}  <->  ${p.b}`);
  }
  console.log(
    `\n${pairs.length} pair(s) at or above ${MIN_SCORE} Jaccard overlap, out of ${(candidates.length * (candidates.length - 1)) / 2} total pairs.`,
  );
  return pairs;
}

if (require.main === module) main();
module.exports = { main, jaccard, tokenize };
