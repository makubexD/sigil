/**
 * A shared skill's stack table is generated, not hand-written: `<!-- stack-index -->` in SKILL.md
 * becomes one row per stack part, labelled by the part's own H1 (the language layer names its
 * libraries) and linked by the path the part ships at. `catalog-layout` wants the marker exactly
 * once in a skill with stack parts, and no hand-written stack links beside it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fillStackIndex, STACK_INDEX_MARKER } from '../dist-cli/stack-index';
import { loadCatalog } from '../dist-cli/load';
import { resolveCatalog } from '../dist-cli/resolve';
import { runConformance } from '../dist-cli/commands/sync/conformance/detect';
import { getAllTargets } from '../dist-cli/targets/index';
import { CATALOG_DIR } from './helpers/catalog';
import { withTempDirAsync } from './helpers/temp-dir';

const REFS = [
  { name: 'core.md', content: '# Core\n' },
  { name: 'stack-dotnet.md', content: '# .NET: System.CommandLine\n\nBody.\n' },
  { name: 'stack-go.md', content: '# Go: cobra\n' },
];

describe('fillStackIndex', () => {
  it('should turn the marker into one row per stack part, labelled by its H1', () => {
    const body = `Intro.\n\n${STACK_INDEX_MARKER}\n\nOutro.`;
    assert.equal(
      fillStackIndex(body, REFS),
      'Intro.\n\n| Stack | File |\n|---|---|\n' +
        '| .NET: System.CommandLine | [`references/stack-dotnet.md`](references/stack-dotnet.md) |\n' +
        '| Go: cobra | [`references/stack-go.md`](references/stack-go.md) |\n\nOutro.',
    );
  });

  it('should leave a body without the marker unchanged', () => {
    assert.equal(fillStackIndex('No table.', REFS), 'No table.');
  });

  it('should give the bundled cli and wizard a row for every stack', async () => {
    const resolved = resolveCatalog(await loadCatalog(CATALOG_DIR));
    for (const id of ['shared/cli', 'shared/wizard']) {
      const body = resolved.byId.get(id)!.resolvedBody ?? '';
      for (const stack of ['dotnet', 'go', 'node-ts', 'python', 'rust']) {
        assert.ok(body.includes(`(references/stack-${stack}.md)`), `${id}: ${stack}`);
      }
      assert.ok(!body.includes(STACK_INDEX_MARKER), id);
    }
  });
});

describe('stack index: catalog-layout', () => {
  const findings = async (skillBody: string) => {
    let out: string[] = [];
    await withTempDirAsync(async root => {
      const files: Record<string, string> = {
        'standard.yaml': 'stacks:\n  - id: dotnet\n    displayName: .NET\n    home: csharp\n',
        'languages/csharp/language.yaml':
          'displayName: "C#"\nprefix: cs\nstack: dotnet\nglobs:\n  - "**/*.cs"\n',
        'languages/csharp/stack-parts/probe.md': '# .NET: probe\n',
        'shared/skills/probe/SKILL.md':
          '---\nid: shared/probe\nkind: skill\nname: probe\ntitle: P\ndescription: A probe.\n---\n\n' +
          skillBody,
      };
      for (const [rel, content] of Object.entries(files)) {
        const file = path.join(root, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
      }
      out = runConformance(await loadCatalog(root), getAllTargets(), {
        ruleId: 'catalog-layout',
      }).map(f => f.detail);
    });
    return out;
  };

  it('should accept the marker as the mention of every stack part', async () => {
    assert.deepEqual(await findings(`Pick one.\n\n${STACK_INDEX_MARKER}\n`), []);
  });

  it('should want the marker, and no hand-written stack link, in a skill with stack parts', async () => {
    const found = await findings('Read [d](references/stack-dotnet.md).\n');
    assert.deepEqual(found, [
      `a skill with stack parts lists them with ${STACK_INDEX_MARKER} (generated), not hand-written links`,
    ]);
  });
});
