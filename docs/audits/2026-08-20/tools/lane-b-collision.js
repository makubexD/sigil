// Lane B — dispatch-collision matrix: pairwise similarity over description+whenToUse text for
// artifacts of the same kind that could be co-installed (same kind, overlapping/absent platform
// scoping). Trigram Jaccard similarity — cheap, deterministic, no external NLP dependency.
'use strict';
const fs = require('fs');
const path = require('path');
const { loadCatalog } = require('./load-catalog.js');

const artifacts = loadCatalog();

function triGrams(text) {
  const norm = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = norm.split(' ');
  const grams = new Set();
  for (let i = 0; i < words.length - 2; i++) grams.add(words.slice(i, i + 3).join(' '));
  return grams;
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function dispatchText(a) {
  const fm = a.frontmatter;
  return [fm.description, fm.whenToUse, fm.when_to_use].filter(Boolean).join(' ');
}

const THRESHOLD = 0.12; // trigram Jaccard rarely exceeds ~0.3 even for near-duplicates; tuned empirically below

const byKind = {};
for (const a of artifacts) {
  if (!['agent', 'skill', 'prompt'].includes(a.kind)) continue; // rules/hooks/mcp/settings dispatch on paths/config, not description
  (byKind[a.kind] ||= []).push({ ...a, grams: triGrams(dispatchText(a)) });
}

const collisions = [];
for (const kind of Object.keys(byKind)) {
  const list = byKind[kind];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const sim = jaccard(list[i].grams, list[j].grams);
      if (sim >= THRESHOLD) {
        collisions.push({
          kind,
          a: list[i].id,
          b: list[j].id,
          similarity: Math.round(sim * 1000) / 1000,
        });
      }
    }
  }
}
collisions.sort((x, y) => y.similarity - x.similarity);

fs.writeFileSync(
  path.resolve(__dirname, '..', 'analysis', 'lane-b-collision.json'),
  JSON.stringify(collisions, null, 2),
);

console.log('=== Lane B: dispatch-collision matrix (trigram Jaccard >= ' + THRESHOLD + ') ===');
console.log('Pairs found:', collisions.length);
for (const c of collisions) console.log(`  [${c.kind}] ${c.a}  <->  ${c.b}   sim=${c.similarity}`);
