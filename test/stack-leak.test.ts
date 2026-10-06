/**
 * `stack-leak` warns when language-neutral text in `shared/` names a stack's own library or tool
 * (`stacks[].terms` in catalog/standard.yaml): that sentence belongs in the stack's part, in the
 * language that owns the stack. Stack parts, and deprecated artifacts, are not scanned.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../dist-cli/load';
import { runConformance } from '../dist-cli/commands/sync/conformance/detect';
import { getAllTargets } from '../dist-cli/targets/index';
import { loadBundledCatalog } from './helpers/catalog';
import { withTempDirAsync } from './helpers/temp-dir';

const RULE = 'stack-leak';
const STANDARD = 'stacks:\n  - id: go\n    displayName: Go\n    home: go\n    terms: [cobra]\n';
const skill = (body: string) =>
  `---\nid: shared/probe\nkind: skill\nname: probe\ntitle: P\ndescription: A probe.\n---\n\n${body}\n`;

async function findings(files: Record<string, string>): Promise<string[]> {
  let out: string[] = [];
  await withTempDirAsync(async root => {
    const all = {
      'standard.yaml': STANDARD,
      'languages/go/language.yaml':
        'displayName: "Go"\nprefix: go\nstack: go\nglobs:\n  - "**/*.go"\n',
      ...files,
    };
    for (const [rel, content] of Object.entries(all)) {
      const file = path.join(root, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    const catalog = await loadCatalog(root);
    out = runConformance(catalog, getAllTargets(), { ruleId: RULE }).map(
      f => `${f.severity} ${f.artifactId} ${f.detail}`,
    );
  });
  return out;
}

describe('stack-leak', () => {
  it("should warn when neutral shared text names a stack's library", async () => {
    const found = await findings({
      'shared/skills/probe/SKILL.md': skill('Wire the grammar with cobra.\n\n<!-- stack-index -->'),
      'languages/go/stack-parts/probe.md': '# Go: cobra\n\nUse cobra here.\n',
    });
    assert.deepEqual(found, [
      "warning shared/probe body names 'cobra' (go stack): move it to languages/go/stack-parts/",
    ]);
  });

  it('should not scan stack parts, or match a term inside another word', async () => {
    const found = await findings({
      'shared/skills/probe/SKILL.md': skill('A cobras nest.\n\n<!-- stack-index -->'),
      'languages/go/stack-parts/probe.md': '# Go: cobra\n',
    });
    assert.deepEqual(found, []);
  });

  it('should find nothing in the bundled catalog', async () => {
    const found = runConformance(await loadBundledCatalog(), getAllTargets(), {
      ruleId: RULE,
    });
    assert.deepEqual(
      found.map(f => `${f.artifactId} ${f.detail}`),
      [],
    );
  });
});
