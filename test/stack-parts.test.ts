/**
 * Stack parts: `shared/` holds only language-neutral text, so a shared skill's per-stack text lives
 * in the language that owns the stack (`languages/<home>/stack-parts/<skill>.md`). The loader puts
 * the parts back into the skill as `references/stack-<stack>.md`, so every target ships the same
 * files as before; `catalog-layout` keeps stack text out of `shared/` and each part in its home.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../dist-cli/load';
import { runConformance } from '../dist-cli/commands/sync/conformance/detect';
import { getAllTargets } from '../dist-cli/targets/index';
import { shippedTexts } from '../dist-cli/artifact-texts';
import { withTempDirAsync } from './helpers/temp-dir';
import { runMove } from '../dist-cli/commands/move';
import { cachedValidCatalog } from '../dist-cli/catalog-cache';
import { loadValidCatalog } from '../dist-cli/cli-helpers';

const CSHARP = 'displayName: "C#"\nprefix: cs\nstack: dotnet\nglobs:\n  - "**/*.cs"\n';
const PYTHON = 'displayName: "Python"\nprefix: py\nstack: python\nglobs:\n  - "**/*.py"\n';
const STANDARD =
  'stacks:\n  - id: dotnet\n    displayName: .NET\n    home: csharp\n' +
  '  - id: python\n    displayName: Python\n    home: python\n';
const SKILL =
  '---\nid: shared/probe\nkind: skill\nname: probe\ntitle: P\ndescription: A probe.\n---\n\n' +
  'Read [core](references/core.md).\n\n<!-- stack-index -->\n';

const BASE: Record<string, string> = {
  'standard.yaml': STANDARD,
  'languages/csharp/language.yaml': CSHARP,
  'languages/python/language.yaml': PYTHON,
  'shared/skills/probe/SKILL.md': SKILL,
  'shared/skills/probe/references/core.md': '# Core\n',
  'languages/csharp/stack-parts/probe.md': '# .NET part\n',
  'languages/python/stack-parts/probe.md': '# Python part\n',
};

/** Writes `files` (catalog-relative path → content, null deletes) over BASE into a temp catalog. */
async function withCatalog(
  files: Record<string, string | null>,
  fn: (root: string) => Promise<void>,
): Promise<void> {
  await withTempDirAsync(async root => {
    for (const [rel, content] of Object.entries({ ...BASE, ...files })) {
      if (content === null) continue;
      const file = path.join(root, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    await fn(root);
  });
}

async function layoutFindings(files: Record<string, string | null>): Promise<string[]> {
  let out: string[] = [];
  await withCatalog(files, async root => {
    const catalog = await loadCatalog(root);
    out = runConformance(catalog, getAllTargets(), { ruleId: 'catalog-layout' }).map(
      f => `${f.artifactId ?? '-'} ${f.detail}`,
    );
  });
  return out;
}

describe('stack parts: loading', () => {
  it("should put each language's part back into the shared skill as stack-<stack>.md", async () => {
    await withCatalog({}, async root => {
      const catalog = await loadCatalog(root);
      const skill = catalog.byId.get('shared/probe')!;
      const refs = skill.references ?? [];
      assert.deepEqual(
        refs.map(r => r.name),
        ['core.md', 'stack-dotnet.md', 'stack-python.md'],
      );
      assert.equal(refs[1]!.content, '# .NET part\n');
      const part = path.join(root, 'languages/csharp/stack-parts/probe.md');
      assert.equal(refs[1]!.sourcePath, part);
      const shipped = shippedTexts(skill).find(t => t.label === 'references/stack-dotnet.md');
      assert.equal(shipped?.filePath, part, 'checks point at the part, not a missing shared file');
      assert.deepEqual(catalog.skipWarnings, []);
    });
  });

  it('should skip a part whose language names no stack, and one the skill already has', async () => {
    await withCatalog(
      {
        'languages/python/language.yaml': 'displayName: "Python"\nprefix: py\n',
        'shared/skills/probe/references/stack-dotnet.md': '# own\n',
      },
      async root => {
        const catalog = await loadCatalog(root);
        const names = (catalog.byId.get('shared/probe')!.references ?? []).map(r => r.name);
        assert.deepEqual(names, ['core.md', 'stack-dotnet.md']);
        assert.equal(catalog.byId.get('shared/probe')!.references![1]!.content, '# own\n');
        assert.equal(catalog.skipWarnings.length, 2, catalog.skipWarnings.join('\n'));
      },
    );
  });
});

describe('stack parts: catalog-layout', () => {
  it('should accept parts in their stack homes', async () => {
    assert.deepEqual(await layoutFindings({}), []);
  });

  it('should fail a stack file left inside a shared skill', async () => {
    const found = await layoutFindings({
      'languages/csharp/stack-parts/probe.md': null,
      'shared/skills/probe/references/stack-dotnet.md': '# .NET\n',
    });
    assert.deepEqual(found, [
      'shared/probe references/stack-dotnet.md: stack text lives in languages/csharp/stack-parts/probe.md, not shared/',
    ]);
  });

  it('should fail a part that names no shared skill, and a part outside its home', async () => {
    const found = await layoutFindings({
      'languages/csharp/stack-parts/ghost.md': '# ghost\n',
      'languages/python/stack-parts/probe.md': null,
      'standard.yaml': STANDARD.replace('home: python', 'home: csharp'),
    });
    assert.deepEqual(found.sort(), [
      "- languages/csharp/stack-parts/ghost.md: no shared skill is named 'ghost'",
      "- standard.yaml: stack 'python' has home 'csharp', whose stack is 'dotnet'",
    ]);
  });
});

describe('stack parts: sigil move', () => {
  it("should rename a shared skill's stack parts with it", async () => {
    await withCatalog({}, async root => {
      await runMove('shared/probe', 'shared/renamed', {
        catalogDir: root,
        dryRun: false,
        yes: true,
      });
      for (const language of ['csharp', 'python']) {
        const dir = path.join(root, 'languages', language, 'stack-parts');
        assert.deepEqual(fs.readdirSync(dir), ['renamed.md'], language);
      }
      const catalog = await loadCatalog(root);
      const names = (catalog.byId.get('shared/renamed')!.references ?? []).map(r => r.name);
      assert.deepEqual(names, ['core.md', 'stack-dotnet.md', 'stack-python.md']);
    });
  });
});

describe('stack parts: catalog cache', () => {
  it('should read the catalog again when a stack part changes', async () => {
    await withCatalog({}, async root => {
      const first = await cachedValidCatalog(root, loadValidCatalog);
      const part = (c: typeof first) =>
        c.byId.get('shared/probe')!.references!.find(r => r.name === 'stack-dotnet.md')!.content;
      assert.equal(part(first), '# .NET part\n');
      fs.writeFileSync(
        path.join(root, 'languages/csharp/stack-parts/probe.md'),
        '# changed part\n',
      );
      assert.equal(part(await cachedValidCatalog(root, loadValidCatalog)), '# changed part\n');
    });
  });
});
