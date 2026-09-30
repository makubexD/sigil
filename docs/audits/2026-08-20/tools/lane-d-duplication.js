// Lane D — body-duplication matrix: normalized-shingle overlap between (1) sibling artifacts
// across languages within the same family, and (2) sections within one artifact / across rules
// in one language. Produces the hard number behind F1/F3/F4 and the slot boundaries for
// templatization: shingles that appear in ALL siblings of a family are template-owned prose;
// shingles unique to one sibling are slot content.
'use strict';
const fs = require('fs');
const path = require('path');
const { loadCatalog } = require('./load-catalog.js');

const artifacts = loadCatalog();

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ') // drop code fences — language-specific by design, not prose duplication
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shingles(text, n = 8) {
  const words = normalize(text).split(' ');
  const set = new Set();
  for (let i = 0; i <= words.length - n; i++) set.add(words.slice(i, i + n).join(' '));
  return set;
}

function overlapRatio(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  return inter / Math.min(a.size, b.size); // containment, not Jaccard: catches "B is a subset of A" duplication
}

// Family = same kind + same base slug with the language prefix stripped (ts-audit-deps,
// cs-audit-deps, ng-audit-deps -> family "audit-deps").
function familyOf(a) {
  const name = a.frontmatter.name || a.id.split('/').pop();
  const stripped = name.replace(/^(ts|cs|ng|py|react)-/, '');
  return `${a.kind}:${stripped}`;
}

const LANGS = ['typescript', 'csharp', 'angular'];
const families = {};
for (const a of artifacts) {
  if (!LANGS.includes(a.frontmatter.language)) continue;
  (families[familyOf(a)] ||= []).push(a);
}

const familyReport = [];
for (const [fam, members] of Object.entries(families)) {
  if (members.length < 2) continue;
  const shingleSets = members.map(m => ({ id: m.id, lines: m.lines, set: shingles(m.body) }));
  let pairs = [];
  for (let i = 0; i < shingleSets.length; i++) {
    for (let j = i + 1; j < shingleSets.length; j++) {
      pairs.push({
        a: shingleSets[i].id,
        b: shingleSets[j].id,
        overlap: Math.round(overlapRatio(shingleSets[i].set, shingleSets[j].set) * 1000) / 1000,
      });
    }
  }
  const avgOverlap = pairs.reduce((s, p) => s + p.overlap, 0) / pairs.length;
  familyReport.push({
    family: fam,
    members: members.map(m => ({ id: m.id, lines: m.lines })),
    totalLines: members.reduce((s, m) => s + m.lines, 0),
    avgPairwiseOverlap: Math.round(avgOverlap * 1000) / 1000,
    pairs,
  });
}
familyReport.sort((a, b) => b.avgPairwiseOverlap - a.avgPairwiseOverlap);

fs.writeFileSync(
  path.resolve(__dirname, '..', 'analysis', 'lane-d-duplication.json'),
  JSON.stringify(familyReport, null, 2),
);

console.log(
  '=== Lane D: cross-language family body-shingle overlap (8-word shingles, containment ratio) ===',
);
console.log(`Families with 2+ language siblings: ${familyReport.length}`);
for (const f of familyReport) {
  console.log(
    `  ${f.family.padEnd(28)} avgOverlap=${f.avgPairwiseOverlap}  members=${f.members.length}  totalLines=${f.totalLines}`,
  );
}
const highOverlap = familyReport.filter(f => f.avgPairwiseOverlap >= 0.5);
const totalDuplicatedLines = highOverlap.reduce((s, f) => s + f.totalLines, 0);
console.log(
  `\nFamilies at >=0.5 avg overlap: ${highOverlap.length}, totaling ${totalDuplicatedLines} lines across their members.`,
);
