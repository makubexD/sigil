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
