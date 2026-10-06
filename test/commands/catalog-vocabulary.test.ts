/**
 * One vocabulary as data: each language.yaml names its artifact `prefix` and its `stack`, every stack
 * is declared once in catalog/standard.yaml, and `catalog-layout` holds the catalog to it. Families
 * are data too, so `catalog-symmetry` sees one concern under several names as one family.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../../dist-cli/load';
import { runConformance } from '../../dist-cli/commands/sync/conformance/detect';
import { declaredFindings } from '../../dist-cli/commands/sync/conformance/rules/catalog-symmetry';
import { loadCatalogStandard, parseCatalogStandard } from '../../dist-cli/catalog-standard';
import { getAllTargets } from '../../dist-cli/targets/index';
import { CATALOG_DIR } from '../helpers/catalog';
import { withTempDirAsync } from '../helpers/temp-dir';

const STANDARD = 'stacks:\n  - id: dotnet\n    displayName: .NET\n';
const csharpYaml = (extra: string) => `displayName: "C#"\n${extra}globs:\n  - "**/*.cs"\n`;
const rule = (id: string) =>
  `---\nid: ${id}\nkind: rule\ntitle: P\ndescription: A C# probe.\n---\n\n- **P.** x\n`;

/** The catalog-layout findings for a catalog made of `files` (catalog-relative path → content). */
async function layoutFindings(files: Record<string, string>): Promise<string[]> {
  let out: string[] = [];
  await withTempDirAsync(async root => {
    for (const [rel, content] of Object.entries(files)) {
      const file = path.join(root, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    const catalog = await loadCatalog(root);
    out = runConformance(catalog, getAllTargets(), { ruleId: 'catalog-layout' }).map(f => f.detail);
  });
  return out;
}

describe('catalog vocabulary (catalog-layout)', () => {
  it('should accept a language with a declared prefix and stack', async () => {
    const found = await layoutFindings({
      'standard.yaml': STANDARD,
      'languages/csharp/language.yaml': csharpYaml('prefix: cs\nstack: dotnet\n'),
      'languages/csharp/rules/cs-p.rule.md': rule('csharp/cs-p'),
    });
    assert.deepEqual(found, []);
  });

  it('should flag a language without a prefix, and a stack the standard does not declare', async () => {
    const found = await layoutFindings({
      'standard.yaml': STANDARD,
      'languages/csharp/language.yaml': csharpYaml('stack: java\n'),
    });
    assert.ok(
      found.some(d => /declares no prefix/.test(d)),
      found.join('\n'),
    );
    assert.ok(
      found.some(d => /stack 'java' is not declared/.test(d)),
      found.join('\n'),
    );
  });

  it("should flag a name that doesn't start with its language's prefix", async () => {
    const found = await layoutFindings({
      'standard.yaml': STANDARD,
      'languages/csharp/language.yaml': csharpYaml('prefix: cs\nstack: dotnet\n'),
      'languages/csharp/rules/dotnet-p.rule.md': rule('csharp/dotnet-p'),
    });
    assert.deepEqual(found, ["name 'dotnet-p' does not start with the csharp prefix 'cs-'"]);
  });

  it("should flag a language artifact whose description doesn't name its language", async () => {
    const found = await layoutFindings({
      'standard.yaml': STANDARD,
      'languages/csharp/language.yaml': csharpYaml('prefix: cs\nstack: dotnet\n'),
      'languages/csharp/rules/cs-p.rule.md': rule('csharp/cs-p').replace('A C# probe.', 'A probe.'),
      'languages/csharp/rules/cs-q.rule.md': rule('csharp/cs-q'),
    });
    assert.deepEqual(found, ['description does not name its language (csharp, C#)']);
  });

  it('should flag a language rule glob that matches only at the repository root', async () => {
    const anchored = rule('csharp/cs-p').replace('---\n\n', 'appliesTo:\n  - .gitignore\n---\n\n');
    const found = await layoutFindings({
      'standard.yaml': STANDARD,
      'languages/csharp/language.yaml': csharpYaml('prefix: cs\nstack: dotnet\n'),
      'languages/csharp/rules/cs-p.rule.md': anchored,
    });
    assert.deepEqual(found, ["appliesTo '.gitignore' matches only at the root; start it with **/"]);
  });

  it('should flag a shared rule that two rules of one language extend (it loads twice)', async () => {
    const extending = (id: string) =>
      rule(id).replace('---\n\n', 'extends:\n  - shared/base\n---\n\n');
    const found = await layoutFindings({
      'standard.yaml': STANDARD,
      'languages/csharp/language.yaml': csharpYaml('prefix: cs\nstack: dotnet\n'),
      'shared/rules/base.rule.md': rule('shared/base'),
      'languages/csharp/rules/cs-a.rule.md': extending('csharp/cs-a'),
      'languages/csharp/rules/cs-b.rule.md': extending('csharp/cs-b'),
    });
    assert.deepEqual(found, [
      'shared/base is extended by csharp/cs-a and csharp/cs-b, so csharp loads it twice; keep one',
    ]);
  });

  it('should leave a catalog without standard.yaml to the older checks', async () => {
    const found = await layoutFindings({
      'languages/csharp/language.yaml': csharpYaml(''),
      'languages/csharp/rules/dotnet-p.rule.md': rule('csharp/dotnet-p'),
    });
    assert.deepEqual(found, []);
  });

  it('should give every bundled language a prefix and a declared stack', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const stacks = new Set(loadCatalogStandard(CATALOG_DIR)!.stacks.map(s => s.id));
    for (const lang of catalog.languages.values()) {
      assert.ok(lang.prefix, `${lang.id} has no prefix`);
      assert.ok(stacks.has(lang.stack ?? ''), `${lang.id}: stack ${lang.stack}`);
    }
  });
});

describe('catalog-symmetry from family data', () => {
  it('should see one concern under several names as one family', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const found = runConformance(catalog, getAllTargets(), { ruleId: 'catalog-symmetry' });
    const packageManager = found.find(f => /family 'package-manager'/.test(f.detail));
    assert.ok(packageManager, found.map(f => f.detail).join('\n'));
    assert.match(packageManager.detail, /but not angular/);
  });

  it('should treat a language the family marks absent as a deliberate gap', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const standard = parseCatalogStandard(
      'families:\n  - id: package-manager\n    kind: rule\n' +
        '    members: [csharp/cs-nuget, python/py-packaging, react/react-npm, typescript/ts-npm]\n' +
        '    absent:\n      angular: ng-dependencies covers npm\n',
      'probe',
    );
    const languages = ['angular', 'csharp', 'python', 'react', 'typescript'];
    assert.deepEqual(declaredFindings(standard, catalog, languages), []);
  });
});
