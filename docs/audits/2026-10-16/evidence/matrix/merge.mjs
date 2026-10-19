// Phase M: merge every recon's inventory.jsonl and coverage.tsv into one view.
//   node merge.mjs            -> summary to stdout, merged files to ./merged/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPOS = ['ecc-skills', 'ecc-core', 'dotnet', 'agent-skills', 'ponytail', 'sigil'];
const LANGS = ['typescript', 'node', 'angular', 'react', 'csharp', 'python'];

const caps = [];
const bad = [];
const cover = new Map(); // `${lang}\t${topic}` -> {repo: depth}
for (const repo of REPOS) {
  const inv = join(here, repo, 'inventory.jsonl');
  if (!existsSync(inv)) {
    bad.push(`${repo}: no inventory.jsonl`);
    continue;
  }
  readFileSync(inv, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .forEach((l, i) => {
      try {
        caps.push({ source: repo, ...JSON.parse(l) });
      } catch {
        bad.push(`${repo}: inventory line ${i + 1} not JSON`);
      }
    });
  const cov = join(here, repo, 'coverage.tsv');
  if (!existsSync(cov)) continue;
  for (const line of readFileSync(cov, 'utf8').split('\n')) {
    const [lang, topic, depth] = line.split('\t');
    const d = Number(depth);
    if (!LANGS.includes(lang?.trim().toLowerCase()) || Number.isNaN(d)) continue;
    // Topics may carry a parenthetical gloss ("idioms (general style, ...)"): key on the bare topic.
    // "async and concurrency" -> async; "framework: ef core" -> framework-specific (deepest one wins).
    let bare = topic.trim().toLowerCase().split(/\s*\(/)[0].split(' and ')[0];
    if (bare.startsWith('framework')) bare = 'framework-specific';
    const key = `${lang.trim().toLowerCase()}\t${bare}`;
    const row = cover.get(key) ?? {};
    // ECC is two recons over one repo: keep the deeper of the two.
    const owner = repo.startsWith('ecc') ? 'ecc' : repo;
    row[owner] = Math.max(row[owner] ?? 0, d);
    cover.set(key, row);
  }
}

const byCategory = new Map();
for (const c of caps) {
  const list = byCategory.get(c.category) ?? [];
  list.push(c);
  byCategory.set(c.category, list);
}

mkdirSync(join(here, 'merged'), { recursive: true });
writeFileSync(join(here, 'merged', 'capabilities.jsonl'), caps.map(c => JSON.stringify(c)).join('\n') + '\n');

const owners = ['ecc', 'dotnet', 'agent-skills', 'ponytail', 'sigil'];
const covRows = [['lang', 'topic', ...owners].join('\t')];
for (const [key, row] of [...cover].sort()) covRows.push([key, ...owners.map(o => row[o] ?? '-')].join('\t'));
writeFileSync(join(here, 'merged', 'coverage.tsv'), covRows.join('\n') + '\n');

const lines = [`capabilities ${caps.length}`, ...bad.map(b => `WARN ${b}`), '', 'category: per-source count'];
for (const [cat, list] of [...byCategory].sort((a, b) => b[1].length - a[1].length)) {
  const per = {};
  for (const c of list) per[c.source] = (per[c.source] ?? 0) + 1;
  lines.push(`${cat}: ${Object.entries(per).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
lines.push('', 'coverage gaps where sigil < best other repo (lang topic: sigil vs best):');
for (const [key, row] of [...cover].sort()) {
  const best = Math.max(...owners.filter(o => o !== 'sigil').map(o => row[o] ?? 0));
  if ((row.sigil ?? 0) < best) lines.push(`  ${key.replace('\t', ' ')}: ${row.sigil ?? 0} vs ${best}`);
}
console.log(lines.join('\n'));
