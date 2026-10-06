/**
 * One anatomy per family, as data in `catalog/standard.yaml`: members set exactly the family's
 * keys, take its title, carry only the reference files it declares (one stack file per declared
 * stack, all with one skeleton), and load the same families of rules and agents. Shared agents,
 * rules and skills belong to a family too, unless they are a base other rules extend.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../../dist-cli/load';
import { runConformance } from '../../dist-cli/commands/sync/conformance/detect';
import { getAllTargets } from '../../dist-cli/targets/index';
import { withTempDirAsync } from '../helpers/temp-dir';

const RULE = 'family-skeleton';
const CSHARP = 'displayName: "C#"\nprefix: cs\nstack: dotnet\nglobs:\n  - "**/*.cs"\n';
const PYTHON = 'displayName: "Python"\nprefix: py\nstack: python\nglobs:\n  - "**/*.py"\n';
const STACKS =
  'stacks:\n  - id: dotnet\n    displayName: .NET\n  - id: python\n    displayName: Python\n';

const skillMd = (id: string, title: string, extra = '', body = 'Do it.') =>
  `---\nid: ${id}\nkind: skill\nname: ${id.split('/')[1]}\ntitle: ${title}\n` +
  `description: A probe.\nwhenToUse: When probing.\n${extra}---\n\n${body}\n`;
const ruleMd = (id: string) =>
  `---\nid: ${id}\nkind: rule\ntitle: R\ndescription: A C# probe rule.\nappliesTo:\n  - "**/*"\n---\n\n- x\n`;

/** The family-skeleton findings for a catalog made of `files` (catalog-relative path → content). */
async function findings(files: Record<string, string>): Promise<string[]> {
  let out: string[] = [];
  await withTempDirAsync(async root => {
    const all = {
      'languages/csharp/language.yaml': CSHARP,
      'languages/python/language.yaml': PYTHON,
      ...files,
    };
    for (const [rel, content] of Object.entries(all)) {
      const file = path.join(root, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    const catalog = await loadCatalog(root);
    out = runConformance(catalog, getAllTargets(), { ruleId: RULE }).map(
      f => `${f.artifactId ?? '-'} ${f.detail}`,
    );
  });
  return out;
}

const family = (lines: string) => `${STACKS}families:\n  - id: probe\n    kind: skill\n${lines}`;
const CS_SKILL = 'languages/csharp/skills/cs-probe/SKILL.md';
const SHARED_SKILL = 'shared/skills/probe/SKILL.md';

describe('family anatomy (family-skeleton)', () => {
  it('should fail a member that sets a key its family does not declare', async () => {
    const found = await findings({
      'standard.yaml': family('    members: [csharp/cs-probe]\n    keys: [whenToUse]\n'),
      [CS_SKILL]: skillMd('csharp/cs-probe', 'Probe (C#)', 'skillContext: fork\n'),
    });
    assert.deepEqual(found, [
      "csharp/cs-probe family 'probe' does not declare the frontmatter key 'skillContext'",
    ]);
  });

  it("should fail a language member whose title is not the family's title and language", async () => {
    const found = await findings({
      'standard.yaml': family(
        '    title: Probe\n    members: [csharp/cs-probe]\n    keys: [whenToUse]\n',
      ),
      [CS_SKILL]: skillMd('csharp/cs-probe', 'Probe for C#'),
    });
    assert.deepEqual(found, ["csharp/cs-probe family 'probe' titles it 'Probe (C#)'"]);
  });

  it('should allow only the reference files the family declares', async () => {
    const found = await findings({
      'standard.yaml': family(
        '    members: [shared/probe]\n    keys: [whenToUse]\n' +
          '    references:\n      files: { examples: examples }\n',
      ),
      [SHARED_SKILL]: skillMd('shared/probe', 'P', '', 'See [x](references/extra.md).'),
      'shared/skills/probe/references/extra.md': '# Extra\n',
    });
    assert.deepEqual(found.sort(), [
      "shared/probe family 'probe' does not declare the reference 'extra.md'",
      "shared/probe family 'probe' requires the reference 'examples.md'",
    ]);
  });

  it('should want one stack file per declared stack, all with one skeleton', async () => {
    const found = await findings({
      'standard.yaml': family(
        '    members: [shared/probe]\n    keys: [whenToUse]\n    references:\n      stacks: true\n',
      ),
      [SHARED_SKILL]: skillMd('shared/probe', 'P', '', 'See [d](references/stack-dotnet.md).'),
      'shared/skills/probe/references/stack-dotnet.md': '## Wiring\n\nx\n\n## Tests\n\ny\n',
    });
    assert.deepEqual(found, [
      "shared/probe family 'probe' requires the reference 'stack-python.md'",
    ]);
    const drift = await findings({
      'standard.yaml': family(
        '    members: [shared/probe]\n    keys: [whenToUse]\n    references:\n      stacks: true\n',
      ),
      [SHARED_SKILL]: skillMd(
        'shared/probe',
        'P',
        '',
        'See [d](references/stack-dotnet.md) and [p](references/stack-python.md).',
      ),
      'shared/skills/probe/references/stack-dotnet.md': '## Wiring\n\nx\n\n## Tests\n\ny\n',
      'shared/skills/probe/references/stack-python.md': '## Wiring\n\nx\n\n## Pitfalls\n\ny\n',
    });
    assert.deepEqual(drift, [
      'shared/probe references/stack-python.md: section "Pitfalls" where stack-dotnet.md has "Tests"',
    ]);
  });

  it('should fail members that load rules from different families', async () => {
    const standard =
      `${STACKS}families:\n  - id: probe\n    kind: skill\n    keys: [whenToUse]\n` +
      '    members: [csharp/cs-probe, python/py-probe]\n' +
      '  - id: testing\n    kind: rule\n    keys: [appliesTo]\n' +
      '    members: [csharp/cs-testing, python/py-testing]\n' +
      '  - id: conventions\n    kind: rule\n    keys: [appliesTo]\n' +
      '    members: [python/py-conventions]\n';
    const uses = (rule: string) => `uses:\n  rules:\n    - ${rule}\n`;
    const found = await findings({
      'standard.yaml': standard,
      [CS_SKILL]: skillMd('csharp/cs-probe', 'P', uses('csharp/cs-testing')),
      'languages/python/skills/py-probe/SKILL.md': skillMd(
        'python/py-probe',
        'P',
        uses('python/py-conventions'),
      ),
      'languages/csharp/rules/cs-testing.rule.md': ruleMd('csharp/cs-testing'),
      'languages/python/rules/py-testing.rule.md': ruleMd('python/py-testing'),
      'languages/python/rules/py-conventions.rule.md': ruleMd('python/py-conventions'),
    });
    assert.deepEqual(found, [
      "python/py-probe family 'probe': loads rules from conventions where csharp/cs-probe loads testing",
    ]);
  });

  it('should fail a shared artifact in no family, unless it is a base', async () => {
    const found = await findings({
      'standard.yaml': `${STACKS}bases: [shared/base]\n`,
      'shared/rules/base.rule.md': ruleMd('shared/base'),
      'shared/rules/loose.rule.md': ruleMd('shared/loose'),
    });
    assert.deepEqual(found, ['shared/loose belongs to no family in standard.yaml']);
  });
});
