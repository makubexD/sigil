// Lane E — intra-file duplication: does one artifact body restate the same point twice (e.g. a
// bullet in an early section and a full ## section later saying the same thing)? Detected via
// paragraph-level shingle self-overlap: split the body into paragraphs, shingle each, and flag
// any pair of paragraphs from the SAME artifact with high overlap.
'use strict';
const fs = require('fs');
const path = require('path');
const { loadCatalog } = require('./load-catalog.js');

const artifacts = loadCatalog();

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function shingles(text, n = 5) {
  const words = normalize(text).split(' ');
  const set = new Set();
  for (let i = 0; i <= words.length - n; i++) set.add(words.slice(i, i + n).join(' '));
  return set;
}
function overlapRatio(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  return inter / Math.min(a.size, b.size);
}

const findings = [];
for (const a of artifacts) {
  // Split on markdown headings/blank-line paragraph boundaries; keep chunks with real content.
  const paras = a.body
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 60 && !p.startsWith('```'));
  const withShingles = paras.map(p => ({ text: p, set: shingles(p) }));
  for (let i = 0; i < withShingles.length; i++) {
    for (let j = i + 1; j < withShingles.length; j++) {
      const ov = overlapRatio(withShingles[i].set, withShingles[j].set);
      if (ov >= 0.4 && withShingles[i].set.size >= 4) {
        findings.push({
          id: a.id,
          kind: a.kind,
          overlap: Math.round(ov * 1000) / 1000,
          snippetA: withShingles[i].text.slice(0, 100),
          snippetB: withShingles[j].text.slice(0, 100),
        });
      }
    }
  }
}

fs.writeFileSync(
  path.resolve(__dirname, '..', 'analysis', 'lane-e-intrafile.json'),
  JSON.stringify(findings, null, 2),
);

console.log('=== Lane E: intra-file duplicate paragraphs (5-word shingle overlap >= 0.4) ===');
console.log('Findings:', findings.length);
for (const f of findings) {
  console.log(`  ${f.id} [${f.kind}] overlap=${f.overlap}`);
  console.log(`    A: ${f.snippetA}`);
  console.log(`    B: ${f.snippetB}`);
}
