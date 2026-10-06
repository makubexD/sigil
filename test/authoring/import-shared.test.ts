/**
 * `sigil import` brings in a skill whole and in the catalog's layout: `--shared` writes shared ids
 * with no `language:`, a skill's flat `references/*.md` files come along (held to the loader's rules
 * and trust-scanned), and anything that can't ship — nested reference folders, `assets/`,
 * `scripts/` — is reported instead of dropped silently.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { runImport } from '../../dist-cli/commands/import';
import { withTempDirAsync } from '../helpers/temp-dir';

const FAKE_AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';

/** A portable template folder: one skill with references and extras, and one rule. */
function writeSource(root: string, stackGo = '# Go\nUse cobra.\n'): string {
  const src = path.join(root, 'source');
  const files: Record<string, string> = {
    'skills/demo/SKILL.md':
      '---\nname: demo\ndescription: Demo skill. Use when testing import.\n---\n\nRead `references/stack-go.md`.\n',
    'skills/demo/references/stack-go.md': stackGo,
    'skills/demo/references/stacks/python.md': '# Python\n',
    'skills/demo/assets/demo-rules.md': '# Rules\n',
    'rules/style.md': '---\ndescription: House style.\n---\n\n- **Style.** Keep it short.\n',
  };
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(src, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return src;
}

function emptyCatalog(root: string): string {
  const dir = path.join(root, 'catalog');
  fs.mkdirSync(path.join(dir, 'shared'), { recursive: true });
  return dir;
}

/** Runs `fn` with console output captured; returns everything printed. */
async function captured(fn: () => Promise<void>): Promise<string> {
  const original = { log: console.log, warn: console.warn };
  const lines: string[] = [];
  console.log = (...a: unknown[]) => lines.push(a.join(' '));
  console.warn = (...a: unknown[]) => lines.push(a.join(' '));
  try {
    await fn();
  } finally {
    Object.assign(console, original);
  }
  return lines.join('\n');
}

const importOpts = (catalogDir: string, extra: Record<string, unknown> = {}) => ({
  catalogDir,
  dryRun: false,
  yes: true,
  overwrite: false,
  createLanguage: false,
  ...extra,
});

describe('sigil import --shared', () => {
  it('should write shared ids with no language and copy flat references', async () => {
    await withTempDirAsync(async root => {
      const catalog = emptyCatalog(root);
      await captured(() => runImport(writeSource(root), importOpts(catalog, { shared: true })));
      const skillDir = path.join(catalog, 'shared', 'skills', 'demo');
      const skill = matter(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')).data;
      assert.equal(skill.id, 'shared/demo');
      assert.equal(skill.language, undefined);
      assert.equal(
        fs.readFileSync(path.join(skillDir, 'references', 'stack-go.md'), 'utf8'),
        '# Go\nUse cobra.\n',
      );
      const rule = matter(
        fs.readFileSync(path.join(catalog, 'shared', 'rules', 'style.rule.md'), 'utf8'),
      ).data;
      assert.equal(rule.id, 'shared/style');
      assert.equal(rule.language, undefined);
    });
  });

  it('should report what a skill carries that cannot ship', async () => {
    await withTempDirAsync(async root => {
      const catalog = emptyCatalog(root);
      const out = await captured(() =>
        runImport(writeSource(root), importOpts(catalog, { shared: true })),
      );
      assert.match(out, /assets/);
      assert.match(out, /references[\\/]stacks/);
      assert.equal(fs.existsSync(path.join(catalog, 'shared', 'skills', 'demo', 'assets')), false);
    });
  });

  it('should not import a skill whose reference holds a secret', async () => {
    await withTempDirAsync(async root => {
      const catalog = emptyCatalog(root);
      const source = writeSource(root, `# Go\n${FAKE_AWS_KEY}\n`);
      await assert.rejects(
        captured(() => runImport(source, importOpts(catalog, { shared: true }))),
        /Fix the errors/,
      );
      assert.equal(fs.existsSync(path.join(catalog, 'shared', 'skills', 'demo')), false);
    });
  });

  it('should refuse a --language that is not a plain language name', async () => {
    await withTempDirAsync(async root => {
      const catalog = emptyCatalog(root);
      const source = writeSource(root);
      await assert.rejects(
        runImport(source, importOpts(catalog, { language: '../escape', createLanguage: true })),
        /language/,
      );
      assert.equal(fs.existsSync(path.join(root, 'escape')), false);
    });
  });

  it('should not create language.yaml on a dry run', async () => {
    await withTempDirAsync(async root => {
      const catalog = emptyCatalog(root);
      await captured(() =>
        runImport(
          writeSource(root),
          importOpts(catalog, { language: 'go', createLanguage: true, dryRun: true }),
        ),
      );
      assert.equal(fs.existsSync(path.join(catalog, 'languages', 'go', 'language.yaml')), false);
    });
  });

  it('should not write a reference through a symbolic link in the catalog', async t => {
    await withTempDirAsync(async root => {
      const catalog = emptyCatalog(root);
      const outside = path.join(root, 'outside.md');
      fs.writeFileSync(outside, 'untouched\n');
      const refs = path.join(catalog, 'shared', 'skills', 'demo', 'references');
      fs.mkdirSync(refs, { recursive: true });
      try {
        fs.symlinkSync(outside, path.join(refs, 'stack-go.md'), 'file');
      } catch {
        return t.skip('this machine cannot create file symlinks');
      }
      await captured(() =>
        runImport(writeSource(root), importOpts(catalog, { shared: true, overwrite: true })),
      ).catch(() => undefined);
      assert.equal(fs.readFileSync(outside, 'utf8'), 'untouched\n');
    });
  });

  it('should require exactly one of --language and --shared', async () => {
    await withTempDirAsync(async root => {
      const catalog = emptyCatalog(root);
      const source = writeSource(root);
      await assert.rejects(runImport(source, importOpts(catalog)), /--language|--shared/);
      await assert.rejects(
        runImport(source, importOpts(catalog, { shared: true, language: 'csharp' })),
        /--language|--shared/,
      );
    });
  });
});

/** A catalog with a standard: go's stack text lives in languages/go, and dotnet is undeclared. */
function catalogWithStandard(root: string): string {
  const dir = emptyCatalog(root);
  fs.writeFileSync(
    path.join(dir, 'standard.yaml'),
    'stacks:\n  - id: go\n    displayName: Go\n    home: go\n',
  );
  const go = path.join(dir, 'languages', 'go');
  fs.mkdirSync(go, { recursive: true });
  fs.writeFileSync(
    path.join(go, 'language.yaml'),
    'displayName: "Go"\nprefix: go\nstack: go\nglobs:\n  - "**/*.go"\n',
  );
  return dir;
}

describe('sigil import: stack files go to their language', () => {
  it("should write a shared skill's stack file as a part in the stack's home", async () => {
    await withTempDirAsync(async root => {
      const catalog = catalogWithStandard(root);
      const src = writeSource(root);
      fs.writeFileSync(path.join(src, 'skills/demo/references/stack-dotnet.md'), '# .NET\n');
      const out = await captured(() => runImport(src, importOpts(catalog, { shared: true })));
      const part = path.join(catalog, 'languages', 'go', 'stack-parts', 'demo.md');
      assert.equal(fs.readFileSync(part, 'utf8'), '# Go\nUse cobra.\n');
      const refs = path.join(catalog, 'shared', 'skills', 'demo', 'references');
      assert.ok(!fs.existsSync(path.join(refs, 'stack-go.md')), 'no stack text in shared/');
      assert.ok(
        !fs.existsSync(path.join(refs, 'stack-dotnet.md')),
        'undeclared stack not imported',
      );
      assert.match(out, /stack-go\.md\s+→\s+catalog\/languages\/go\/stack-parts\/demo\.md/);
      assert.match(out, /stack-dotnet\.md: stack 'dotnet' is not declared in standard\.yaml/);
      assert.match(out, /<!-- stack-index -->/);
    });
  });

  it('should not import stack files into a language skill', async () => {
    await withTempDirAsync(async root => {
      const catalog = catalogWithStandard(root);
      const out = await captured(() =>
        runImport(writeSource(root), importOpts(catalog, { language: 'go' })),
      );
      assert.ok(!fs.existsSync(path.join(catalog, 'languages', 'go', 'stack-parts')));
      assert.ok(
        !fs.existsSync(
          path.join(catalog, 'languages', 'go', 'skills', 'demo', 'references', 'stack-go.md'),
        ),
      );
      assert.match(out, /a language skill carries no stack files; import it with --shared/);
    });
  });
});

describe('sigil import: prefixes come from language.yaml', () => {
  it("should strip a language's own prefix from the title, for any language", async () => {
    await withTempDirAsync(async root => {
      const catalog = catalogWithStandard(root);
      const src = path.join(root, 'go-source');
      const skill = path.join(src, 'skills', 'go-lint-fix', 'SKILL.md');
      fs.mkdirSync(path.dirname(skill), { recursive: true });
      fs.writeFileSync(
        skill,
        '---\nname: go-lint-fix\ndescription: Fix Go lint. Use for Go.\n---\n\nFix.\n',
      );
      await captured(() => runImport(src, importOpts(catalog, { language: 'go' })));
      const written = path.join(catalog, 'languages', 'go', 'skills', 'go-lint-fix', 'SKILL.md');
      assert.equal(matter(fs.readFileSync(written, 'utf8')).data.title, 'Lint Fix (Go)');
    });
  });
});
