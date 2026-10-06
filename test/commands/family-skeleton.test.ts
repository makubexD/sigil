/**
 * One family, one skeleton: `catalog/standard.yaml` declares each family's members and, optionally,
 * the H2 sections every member has in order and the keys every member sets. `family-skeleton`
 * fails `sync --check` when a member drifts, and when the data itself is wrong.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../../dist-cli/load';
import { runConformance } from '../../dist-cli/commands/sync/conformance/detect';
import { skeletonDrift } from '../../dist-cli/commands/sync/conformance/rules/family-skeleton';
import { parseCatalogStandard } from '../../dist-cli/catalog-standard';
import { h2Headings, sectionKey } from '../../dist-cli/markdown-headings';
import { getAllTargets } from '../../dist-cli/targets/index';
import { CATALOG_DIR } from '../helpers/catalog';
import { withTempDirAsync } from '../helpers/temp-dir';

const RULE = 'family-skeleton';
const LANGUAGE_YAML = 'displayName: "C#"\nprefix: cs\nstack: dotnet\nglobs:\n  - "**/*.cs"\n';
const agent = (id: string, body: string, extra = '') =>
  `---\nid: ${id}\nkind: agent\nname: ${id.split('/')[1]}\ntitle: P\n` +
  `description: Use to probe.\ntools:\n  - Read\n${extra}---\n\n${body}\n`;
const STANDARD = `stacks:
  - id: dotnet
    displayName: .NET
families:
  - id: debugger
    kind: agent
    members: [csharp/cs-debugger]
    keys: [tools]
    sections:
      - Reproduce
      - heading: Isolate
        optional: true
      - Output
`;
const GOOD_BODY = '## 1. Reproduce\n\nx\n\n## Output\n\ny';

/** The family-skeleton findings for a catalog made of `files` (catalog-relative path → content). */
async function findings(files: Record<string, string>): Promise<string[]> {
  let out: string[] = [];
  await withTempDirAsync(async root => {
    const all = { 'languages/csharp/language.yaml': LANGUAGE_YAML, ...files };
    for (const [rel, content] of Object.entries(all)) {
      const file = path.join(root, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    const catalog = await loadCatalog(root);
    out = runConformance(catalog, getAllTargets(), { ruleId: RULE }).map(
      f => `${f.severity} ${f.artifactId ?? '-'} ${f.detail}`,
    );
  });
  return out;
}

const DEBUGGER = 'languages/csharp/agents/cs-debugger.agent.md';

describe('family-skeleton', () => {
  it('should find no errors in the bundled catalog', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const errors = runConformance(catalog, getAllTargets(), { ruleId: RULE }).filter(
      f => f.severity === 'error',
    );
    assert.deepEqual(errors, []);
  });

  it('should accept a member with the skeleton, numbered or not, optional sections left out', async () => {
    const found = await findings({
      'standard.yaml': STANDARD,
      [DEBUGGER]: agent('csharp/cs-debugger', GOOD_BODY),
    });
    assert.deepEqual(found, []);
  });

  it('should fail a member whose sections drift from the skeleton', async () => {
    const found = await findings({
      'standard.yaml': STANDARD,
      [DEBUGGER]: agent('csharp/cs-debugger', '## Reproduce\n\nx\n\n## Workflow\n\ny'),
    });
    assert.equal(found.length, 1, found.join('\n'));
    assert.match(found[0]!, /^error csharp\/cs-debugger .*expected section "Output"/);
  });

  it('should fail a member without a required key', async () => {
    const body = agent('csharp/cs-debugger', GOOD_BODY).replace('tools:\n  - Read\n', '');
    const found = await findings({ 'standard.yaml': STANDARD, [DEBUGGER]: body });
    assert.ok(
      found.some(f => /requires the frontmatter key 'tools'/.test(f)),
      found.join('\n'),
    );
  });

  it('should fail data that lists a missing artifact or the same member twice', async () => {
    const twice = STANDARD.replace(
      'families:\n',
      'families:\n  - id: other\n    kind: agent\n    members: [csharp/cs-debugger, csharp/cs-gone]\n',
    );
    const found = await findings({
      'standard.yaml': twice,
      [DEBUGGER]: agent('csharp/cs-debugger', GOOD_BODY),
    });
    assert.ok(found.some(f => /lists 'csharp\/cs-gone', not in the catalog/.test(f)));
    assert.ok(found.some(f => /listed in families 'other' and 'debugger'/.test(f)));
  });

  it('should warn about a language artifact that belongs to no family', async () => {
    const found = await findings({
      'standard.yaml': STANDARD,
      [DEBUGGER]: agent('csharp/cs-debugger', GOOD_BODY),
      'languages/csharp/agents/cs-lonely.agent.md': agent('csharp/cs-lonely', 'x'),
    });
    assert.deepEqual(found, ['warning csharp/cs-lonely belongs to no family in standard.yaml']);
  });

  it('should check nothing when the catalog has no standard.yaml', async () => {
    assert.deepEqual(await findings({ [DEBUGGER]: agent('csharp/cs-debugger', 'x') }), []);
  });
});

describe('skeletonDrift', () => {
  const skeleton = [
    { heading: 'A', optional: false },
    { heading: 'B', optional: true },
    { heading: 'C', optional: false },
  ];

  it('should report a missing required section and an extra one', () => {
    assert.match(skeletonDrift(skeleton, ['A'])!, /missing section "C"/);
    assert.match(skeletonDrift(skeleton, ['A', 'C', 'D'])!, /"D" is not in the family skeleton/);
    assert.equal(skeletonDrift(skeleton, ['A', 'B', 'C']), undefined);
  });
});

describe('h2Headings', () => {
  it('should skip fenced code and ignore step numbering', () => {
    const body = '## Step 1 — Reproduce\n```md\n## not a heading\n```\n## 2) Fix\n### sub';
    assert.deepEqual(h2Headings(body).map(sectionKey), ['reproduce', 'fix']);
  });
});

describe('parseCatalogStandard', () => {
  it('should reject a family of an unknown kind', () => {
    assert.throws(
      () => parseCatalogStandard('families:\n  - id: x\n    kind: hook\n    members: [a/b]\n', 's'),
      /families\.0\.kind/,
    );
  });
});
