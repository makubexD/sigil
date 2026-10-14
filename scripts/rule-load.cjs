/**
 * Rule bytes an agent receives with one source file open, per language (Claude path-scoped rules,
 * every rule of the language installed). Used to report before/after numbers on catalog changes.
 *
 * A base rule that a language rule inlines through `extends` (shared/git, shared/clean-code) is
 * dropped the way `add` drops it (`dropInlinedBaseRules`), so it is counted once, inside the rule
 * that extends it.
 *
 * Run: npm run rule-load [-- --json]   (needs a current dist-cli/: npm run build)
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
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

async function main() {
  const report = await ruleLoad();
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

module.exports = { ruleLoad };
