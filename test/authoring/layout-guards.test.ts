/**
 * Write-time layout guards (the "prevent" layer of the catalog layout standard). `sigil check` —
 * and every authoring command that runs it before writing — rejects a shared artifact that names a
 * language and a language namespace with no `language.yaml`; `sigil new` refuses an unknown
 * `--language` before creating anything.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../../dist-cli/load';
import { checkSourceArtifact } from '../../dist-cli/authoring/check-source';
import { runNew } from '../../dist-cli/commands/new';
import { getAllTargets } from '../../dist-cli/targets/index';
import { withTempDirAsync } from '../helpers/temp-dir';

const LANGUAGE_YAML = 'displayName: "C#"\nglobs:\n  - "**/*.cs"\n';

function rule(id: string, extra = ''): string {
  return `---\nid: ${id}\nkind: rule\ntitle: Probe\ndescription: A probe rule.\n${extra}---\n\n- **Probe.** x\n`;
}

/** Writes `files` (catalog-relative path → content) under `root` and loads the catalog. */
async function catalogWith(root: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return loadCatalog(root);
}

async function problemsFor(root: string, files: Record<string, string>, id: string) {
  const catalog = await catalogWith(root, files);
  return checkSourceArtifact(catalog.byId.get(id)!, catalog, getAllTargets()).map(v => v.problem);
}

describe('sigil check — layout guards', () => {
  it('should reject a shared artifact that names a language', async () => {
    await withTempDirAsync(async root => {
      const problems = await problemsFor(
        root,
        {
          'languages/csharp/language.yaml': LANGUAGE_YAML,
          'shared/rules/probe.rule.md': rule('shared/probe', 'language: csharp\n'),
        },
        'shared/probe',
      );
      assert.ok(
        problems.some(p => /shared artifact/.test(p)),
        problems.join('\n'),
      );
    });
  });

  it('should reject a language namespace with no language.yaml', async () => {
    await withTempDirAsync(async root => {
      const problems = await problemsFor(
        root,
        { 'languages/klingon/rules/probe.rule.md': rule('klingon/probe') },
        'klingon/probe',
      );
      assert.ok(
        problems.some(p => /klingon.*language\.yaml/.test(p)),
        problems.join('\n'),
      );
    });
  });

  it('should accept a registered language and a plain shared artifact', async () => {
    await withTempDirAsync(async root => {
      const files = {
        'languages/csharp/language.yaml': LANGUAGE_YAML,
        'languages/csharp/rules/probe.rule.md': rule('csharp/probe', 'language: csharp\n'),
        'shared/rules/other.rule.md': rule('shared/other'),
      };
      const catalog = await catalogWith(root, files);
      for (const id of ['csharp/probe', 'shared/other']) {
        const problems = checkSourceArtifact(catalog.byId.get(id)!, catalog, getAllTargets());
        assert.deepEqual(problems, [], id);
      }
    });
  });
});

describe('sigil new — unknown language', () => {
  it('should refuse an unknown --language and write nothing', async () => {
    await withTempDirAsync(async root => {
      await catalogWith(root, { 'languages/csharp/language.yaml': LANGUAGE_YAML });
      const run = runNew('rule', {
        name: 'probe',
        language: 'klingon',
        catalogDir: root,
        yes: true,
        interactive: false,
      });
      await assert.rejects(run, (e: Error & { hint?: string }) => {
        assert.match(e.message, /klingon/);
        assert.match(e.hint ?? '', /csharp/);
        return true;
      });
      assert.equal(fs.existsSync(path.join(root, 'languages', 'klingon')), false);
    });
  });
});
