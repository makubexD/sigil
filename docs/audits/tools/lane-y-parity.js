// Lane Y — cross-provider semantic parity (round 4, new).
//
// Rounds 1-3 checked Copilot parity only on paper (Lane X: does a Claude-supported kind have a
// matching KindEmitSpec for Copilot?). No prior round ever actually built a Copilot install and
// compared its EMITTED FILES against Claude's for the same artifact set. This lane reads two
// already-emitted trees (produced by `sigil add --target claude` / `--target copilot` into the
// same consumer project — see the round-4 decision log for how they were built) and checks:
//
//   1. Same artifact set landed under both providers (nothing silently dropped).
//   2. Body equivalence modulo the lexicon: reverse-substitute each provider's known lexicon
//      literal values back to {sigil:<term>}, then diff — a residual difference is a real
//      content divergence, not just a provider-appropriate translation.
//   3. Zero provider-term leakage in either direction — Claude literals in Copilot output or the
//      reverse (the exact defect class provider-term-leak guards in catalog SOURCE; this lane
//      checks the compiled OUTPUT, which is a different trust boundary).
//
// Usage: node lane-y-parity.js <claude-consumer-dir> <copilot-consumer-dir>
'use strict';
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const CLAUDE_LEXICON_VALUES = ['CLAUDE.md', '.claude/rules/', '$ARGUMENTS'];
const COPILOT_LEXICON_VALUES = ['AGENTS.md', '.github/instructions/', 'the request you were given'];

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

// Maps an emitted file's basename (minus provider-specific suffix) to a comparable artifact key,
// e.g. "ts-code-reviewer.agent.md" -> "ts-code-reviewer", "ts-async.instructions.md" -> "ts-async".
// Skills are all literally named SKILL.md, so their key must come from the parent directory
// instead of the basename (the first version of this script collapsed every skill onto one key
// "SKILL" — fixed before this lane's results were trusted).
function artifactKey(relPath) {
  const base = path.basename(relPath);
  if (base === 'SKILL.md') return `skill:${path.basename(path.dirname(relPath))}`;
  return base
    .replace(/\.agent\.md$/, '')
    .replace(/\.instructions\.md$/, '')
    .replace(/^typescript-/, '')
    .replace(/\.md$/, '');
}

function loadArtifacts(root, subdirs) {
  const map = new Map();
  for (const sub of subdirs) {
    for (const file of walkFiles(path.join(root, sub))) {
      if (!file.endsWith('.md')) continue;
      const rel = path.relative(root, file).replace(/\\/g, '/');
      map.set(artifactKey(rel), { rel, raw: fs.readFileSync(file, 'utf8') });
    }
  }
  return map;
}

function leaksOf(raw, forbiddenValues, exceptSelf) {
  return forbiddenValues.filter(v => !exceptSelf.includes(v) && raw.includes(v));
}

function main() {
  const [claudeDir, copilotDir] = process.argv.slice(2);
  if (!claudeDir || !copilotDir) {
    console.error('Usage: node lane-y-parity.js <claude-dir> <copilot-dir>');
    process.exit(2);
  }
  const claude = loadArtifacts(claudeDir, ['.claude/agents', '.claude/rules', '.claude/skills']);
  const copilot = loadArtifacts(copilotDir, [
    '.github/agents',
    '.github/instructions',
    '.github/skills',
  ]);

  const allKeys = new Set([...claude.keys(), ...copilot.keys()]);
  const missingInCopilot = [];
  const missingInClaude = [];
  const termLeaks = [];
  const bodyDivergences = [];

  for (const key of allKeys) {
    const c = claude.get(key);
    const g = copilot.get(key);
    if (!c) missingInClaude.push(key);
    if (!g) missingInCopilot.push(key);
    if (!c || !g) continue;

    const cLeak = leaksOf(c.raw, COPILOT_LEXICON_VALUES, CLAUDE_LEXICON_VALUES);
    const gLeak = leaksOf(g.raw, CLAUDE_LEXICON_VALUES, COPILOT_LEXICON_VALUES);
    if (cLeak.length) termLeaks.push({ key, file: c.rel, provider: 'claude', leaked: cLeak });
    if (gLeak.length) termLeaks.push({ key, file: g.rel, provider: 'copilot', leaked: gLeak });

    const cBody = matter(c.raw).content;
    const gBody = matter(g.raw).content;
    let cNorm = cBody;
    let gNorm = gBody;
    CLAUDE_LEXICON_VALUES.forEach(v => {
      cNorm = cNorm.split(v).join('{sigil}');
    });
    COPILOT_LEXICON_VALUES.forEach(v => {
      gNorm = gNorm.split(v).join('{sigil}');
    });
    if (cNorm.trim() !== gNorm.trim()) {
      bodyDivergences.push({ key, claudeLen: cBody.length, copilotLen: gBody.length });
    }
  }

  const result = {
    artifactsCompared: allKeys.size,
    missingInCopilot,
    missingInClaude,
    termLeaks,
    bodyDivergences: bodyDivergences.map(d => d.key),
    clean: missingInCopilot.length === 0 && missingInClaude.length === 0 && termLeaks.length === 0,
  };
  console.log(JSON.stringify(result, null, 2));
  if (bodyDivergences.length) {
    console.error('\nBody divergences (first 5, normalized lengths):');
    bodyDivergences
      .slice(0, 5)
      .forEach(d => console.error(`  ${d.key}: claude=${d.claudeLen} copilot=${d.copilotLen}`));
  }
}

main();
