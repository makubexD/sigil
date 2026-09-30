// Benchmark diff — reads two round `summary.json` files (see .sigil/audit-local/<date>/summary.json)
// and prints a metric-by-metric delta table. Exists so "compare with our previous information"
// is a command, not a manual re-read of two JSON files — see docs/audits/tools/ header convention.
//
// Usage: node benchmark.js <round-N summary.json> <round-N+1 summary.json>
'use strict';
const fs = require('fs');

function flatten(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, key, out);
    } else if (typeof v === 'number') {
      out[key] = v;
    }
    // strings/arrays are metadata (dates, ids, notes) — not benchmarked as deltas
  }
  return out;
}

function fmtDelta(a, b) {
  const d = b - a;
  if (d === 0) return '=';
  const sign = d > 0 ? '+' : '';
  return `${sign}${d}`;
}

function main() {
  const [pathA, pathB] = process.argv.slice(2);
  if (!pathA || !pathB) {
    console.error('Usage: node benchmark.js <round-N summary.json> <round-N+1 summary.json>');
    process.exit(1);
  }
  const a = JSON.parse(fs.readFileSync(pathA, 'utf8'));
  const b = JSON.parse(fs.readFileSync(pathB, 'utf8'));
  const flatA = flatten(a, '', {});
  const flatB = flatten(b, '', {});
  const keys = [...new Set([...Object.keys(flatA), ...Object.keys(flatB)])].sort();

  console.log(
    `Benchmark: round ${a.round ?? '?'} (${a.date ?? '?'}) -> round ${b.round ?? '?'} (${b.date ?? '?'})`,
  );
  console.log('');
  const rows = keys.map(k => {
    const va = flatA[k];
    const vb = flatB[k];
    const delta = va === undefined || vb === undefined ? 'n/a' : fmtDelta(va, vb);
    return [k, va ?? '-', vb ?? '-', delta];
  });
  const widths = [0, 1, 2, 3].map(i =>
    Math.max(
      ...rows.map(r => String(r[i]).length),
      ['metric', 'roundA', 'roundB', 'delta'][i].length,
    ),
  );
  const header = ['metric', 'roundA', 'roundB', 'delta'];
  const printRow = r => console.log(r.map((c, i) => String(c).padEnd(widths[i])).join('  '));
  printRow(header);
  printRow(widths.map(w => '-'.repeat(w)));
  rows.forEach(printRow);
}

main();
