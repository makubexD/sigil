/**
 * Rule bytes an agent receives with one source file open, per language (Claude path-scoped rules,
 * every rule of the language installed). Used to report before/after numbers on catalog changes.
 *
 * A base rule that a language rule inlines through `extends` (shared/git, shared/clean-code) is
 * dropped the way `add` drops it (`dropInlinedBaseRules`), so it is counted once, inside the rule
 * that extends it.
 *
 * CI keeps each language within its recorded baseline (`rule-load-baseline.json`, test/rule-load.test.ts):
 * growth needs a reason, and a drop larger than SLACK_BYTES must lower the baseline.
 *
 * Run: npm run rule-load [-- --json | --baseline "<why>"]   (needs a current dist-cli/: npm run build)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'rule-load-baseline.json');
/** How far below its baseline a language may fall before the baseline must be lowered. */
const SLACK_BYTES = 1024;
const SAMPLES = {
  typescript: 'src/a/b.ts',
  angular: 'src/app/x.component.ts',
  react: 'src/X.tsx',
  csharp: 'src/A/B.cs',
  python: 'pkg/a.py',
};

function appliesToSample(artifact, sample) {
  return (artifact.frontmatter.appliesTo ?? []).some(glob => path.posix.matchesGlob(sample, glob));
}

async function ruleLoad(catalogDir = path.join(ROOT, 'catalog')) {
  const { loadCatalog } = require(path.join(ROOT, 'dist-cli/load.js'));
  const { resolveCatalog } = require(path.join(ROOT, 'dist-cli/resolve.js'));
  const { dropInlinedBaseRules } = require(path.join(ROOT, 'dist-cli/select/selection.js'));
  const catalog = resolveCatalog(await loadCatalog(catalogDir));
  const rules = catalog.artifacts.filter(a => a.kind === 'rule');
  const languages = {};
  for (const [lang, sample] of Object.entries(SAMPLES)) {
    const installed = rules.filter(a => !a.frontmatter.language || a.frontmatter.language === lang);
    const kept = new Set(
      dropInlinedBaseRules(
        installed.map(a => a.id),
        catalog,
      ).ids,
    );
    const matched = installed
      .filter(a => kept.has(a.id) && appliesToSample(a, sample))
      .map(a => ({ id: a.id, bytes: Buffer.byteLength(a.resolvedBody ?? a.body) }));
    languages[lang] = { sample, rules: matched, bytes: matched.reduce((t, r) => t + r.bytes, 0) };
  }
  return { languages };
}

/** Record today's bytes; a language whose bytes changed takes `reason`, the rest keep theirs. */
function writeBaseline(report, reason) {
  const old = fs.existsSync(BASELINE_PATH)
    ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    : {};
  const next = {};
  for (const [lang, load] of Object.entries(report.languages)) {
    const same = old[lang] && old[lang].bytes === load.bytes;
    next[lang] = { bytes: load.bytes, reason: same ? old[lang].reason : reason };
  }
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
}

async function main() {
  const report = await ruleLoad();
  const at = process.argv.indexOf('--baseline');
  if (at > 0) {
    const reason = process.argv[at + 1];
    if (!reason)
      throw new Error('--baseline needs a reason: npm run rule-load -- --baseline "<why>"');
    writeBaseline(report, reason);
    return;
  }
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  for (const [lang, load] of Object.entries(report.languages)) {
    process.stdout.write(
      `${lang} (${load.sample}): ${(load.bytes / 1024).toFixed(1)} KB, ${load.rules.length} rules\n`,
    );
    for (const rule of load.rules) process.stdout.write(`  ${rule.id.padEnd(36)} ${rule.bytes}\n`);
  }
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(`${err.stack ?? err}\n`);
    process.exit(1);
  });
}

module.exports = { ruleLoad, BASELINE_PATH, SLACK_BYTES };
