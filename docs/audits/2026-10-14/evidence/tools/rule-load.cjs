// Bytes of rules auto-loaded for a sample file per language (Claude scaffold: path-scoped .claude/rules).
const path = require('path');
const root = path.resolve(__dirname, '../../../../..'); // repo root (throwaway; double-counts inlined bases, superseded by scripts/rule-load.cjs)
const { loadCatalog } = require(root + '/dist-cli/load.js');
const { resolveCatalog } = require(root + '/dist-cli/resolve.js');
(async () => {
  const r = resolveCatalog(await loadCatalog(root + '/catalog'));
  const arts = (r.artifacts ?? [...(r.byId?.values?.() ?? [])]);
  const rules = arts.filter(a => (a.kind ?? a.frontmatter?.kind) === 'rule');
  const samples = { typescript: 'src/a/b.ts', angular: 'src/app/x.component.ts', react: 'src/X.tsx', csharp: 'src/A/B.cs', python: 'pkg/a.py' };
  const out = {};
  for (const [lang, file] of Object.entries(samples)) {
    let bytes = 0, n = 0, always = 0;
    for (const a of rules) {
      const fm = a.frontmatter ?? a;
      if (fm.language && fm.language !== lang) continue;
      const globs = fm.appliesTo;
      const body = a.resolvedBody ?? a.body ?? '';
      if (!globs || globs.length === 0) { if (fm.language === lang) { always += Buffer.byteLength(body); n++; } continue; }
      if (globs.some(g => path.posix.matchesGlob(file, g))) { bytes += Buffer.byteLength(body); n++; }
    }
    out[lang] = { rules: n, pathScopedKB: +(bytes/1024).toFixed(1), alwaysKB: +(always/1024).toFixed(1), approxTokens: Math.round((bytes+always)/4) };
  }
  console.table(out);
  if (!rules.length) console.log('keys:', Object.keys(r));
})();
