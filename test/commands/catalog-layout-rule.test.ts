/**
 * `catalog-layout` (the "detect" layer of the catalog layout standard) fails `sync --check` when an
 * artifact sits where the standard says it can't: wrong namespace or kind folder, a skill folder
 * named differently from the skill, `language:` out of step with the namespace, an unregistered
 * language, a file outside both namespaces, or skill-folder content that never ships.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../../dist-cli/load';
import { runConformance } from '../../dist-cli/commands/sync/conformance/detect';
import { getAllTargets } from '../../dist-cli/targets/index';
import { CATALOG_DIR } from '../helpers/catalog';
import { withTempDirAsync } from '../helpers/temp-dir';

const RULE = 'catalog-layout';
const LANGUAGE_YAML = 'displayName: "C#"\nglobs:\n  - "**/*.cs"\n';
const rule = (id: string, extra = '') =>
  `---\nid: ${id}\nkind: rule\ntitle: P\ndescription: A probe.\n${extra}---\n\n- **P.** x\n`;
const skill = (id: string, name: string, body = 'Body.') =>
  `---\nid: ${id}\nkind: skill\nname: ${name}\ntitle: P\ndescription: A probe. Use when probing.\n---\n\n${body}\n`;

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
    out = runConformance(catalog, getAllTargets(), { ruleId: RULE }).map(
      f => `${f.severity} ${f.artifactId ?? ''} ${f.detail}`,
    );
  });
  return out;
}

const CSHARP = { 'languages/csharp/language.yaml': LANGUAGE_YAML };

function expectOne(found: string[], pattern: RegExp): void {
  assert.equal(found.length, 1, found.join('\n'));
  assert.match(found[0]!, /^error /);
  assert.match(found[0]!, pattern);
}

describe('catalog-layout', () => {
  it('should find nothing wrong in the bundled catalog', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    assert.deepEqual(runConformance(catalog, getAllTargets(), { ruleId: RULE }), []);
  });

  it('should flag an id prefix that differs from the namespace', async () => {
    expectOne(
      await layoutFindings({ ...CSHARP, 'shared/rules/p.rule.md': rule('csharp/p') }),
      /prefix/,
    );
  });

  it('should flag a file in another kind folder', async () => {
    expectOne(await layoutFindings({ 'shared/agents/p.rule.md': rule('shared/p') }), /rules\//);
  });

  it('should flag a skill folder named differently from the skill', async () => {
    expectOne(
      await layoutFindings({ 'shared/skills/other/SKILL.md': skill('shared/p', 'p') }),
      /folder/,
    );
  });

  it('should flag language: on a shared artifact', async () => {
    expectOne(
      await layoutFindings({
        ...CSHARP,
        'shared/rules/p.rule.md': rule('shared/p', 'language: csharp\n'),
      }),
      /shared artifact/,
    );
  });

  it('should flag a language: that differs from the namespace', async () => {
    expectOne(
      await layoutFindings({
        ...CSHARP,
        'languages/csharp/rules/p.rule.md': rule('csharp/p', 'language: python\n'),
      }),
      /language/,
    );
  });

  it('should flag a language folder with no language.yaml', async () => {
    expectOne(
      await layoutFindings({ 'languages/klingon/rules/p.rule.md': rule('klingon/p') }),
      /language\.yaml/,
    );
  });

  it('should flag a file outside both namespaces', async () => {
    expectOne(await layoutFindings({ 'misc/p.rule.md': rule('shared/p') }), /namespace/);
  });

  it('should flag skill-folder content that never ships', async () => {
    const found = await layoutFindings({
      'shared/skills/p/SKILL.md': skill('shared/p', 'p', 'Read `references/a.md`.'),
      'shared/skills/p/references/a.md': '# A\n',
      'shared/skills/p/assets/x.md': '# X\n',
      'shared/skills/p/scripts/run.sh': 'echo\n',
      'shared/skills/p/references/stacks/go.md': '# Go\n',
    });
    assert.equal(found.length, 3, found.join('\n'));
    for (const part of ['assets', 'scripts', 'stacks']) {
      assert.ok(
        found.some(f => f.includes(part)),
        `${part}: ${found.join('\n')}`,
      );
    }
  });

  it('should flag a reference SKILL.md never mentions', async () => {
    expectOne(
      await layoutFindings({
        'shared/skills/p/SKILL.md': skill('shared/p', 'p', 'Read `references/a.md`.'),
        'shared/skills/p/references/a.md': '# A\n',
        'shared/skills/p/references/orphan.md': '# Orphan\n',
      }),
      /orphan\.md/,
    );
  });

  it('should flag a stack file not named stack-<stack>.md', async () => {
    expectOne(
      await layoutFindings({
        'shared/skills/p/SKILL.md': skill('shared/p', 'p', 'See `references/stackgo.md`.'),
        'shared/skills/p/references/stackgo.md': '# Go\n',
      }),
      /stack-/,
    );
  });
});
