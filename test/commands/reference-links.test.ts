/**
 * Skills name their reference files with a Markdown link, the form Claude's and VS Code's skill
 * docs both recommend (VS Code: a reference that SKILL.md doesn't reference won't load). The visible
 * text stays the backtick path. `reference-links` fails `sync --check` on a backtick-only mention
 * and `sync --apply` rewrites it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { linkReferences } from '../../dist-cli/commands/sync/conformance/rules/reference-links';
import { runConformance } from '../../dist-cli/commands/sync/conformance/detect';
import { applyMechanicalFindings } from '../../dist-cli/commands/sync/conformance/fix-mechanical';
import { loadCatalog } from '../../dist-cli/load';
import { getAllTargets } from '../../dist-cli/targets/index';
import { withTempDirAsync } from '../helpers/temp-dir';

const RULE = 'reference-links';
const NAMES = ['stack-go.md', 'grammar.md'];
const LINKED = (name: string) => `[\`references/${name}\`](references/${name})`;

describe('linkReferences', () => {
  it('should link a backtick mention of a loaded reference', () => {
    assert.equal(
      linkReferences('Read `references/grammar.md` first.', NAMES),
      `Read ${LINKED('grammar.md')} first.`,
    );
  });

  it('should leave an existing link, an unknown name and a pattern alone', () => {
    const body = `${LINKED('grammar.md')} and \`references/other.md\` and \`references/stack-*.md\``;
    assert.equal(linkReferences(body, NAMES), body);
  });

  it('should not touch fenced code', () => {
    const body = '```\ncat `references/grammar.md`\n```\nThen `references/stack-go.md`.';
    assert.equal(
      linkReferences(body, NAMES),
      `\`\`\`\ncat \`references/grammar.md\`\n\`\`\`\nThen ${LINKED('stack-go.md')}.`,
    );
  });
});

describe('reference-links rule', () => {
  it('should flag a backtick-only mention and fix it with --apply', async () => {
    await withTempDirAsync(async root => {
      const skillDir = path.join(root, 'shared', 'skills', 'p');
      fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
      const skillMd = path.join(skillDir, 'SKILL.md');
      fs.writeFileSync(
        skillMd,
        '---\nid: shared/p\nkind: skill\nname: p\ntitle: P\ndescription: A probe. Use when probing.\n---\n\nRead `references/grammar.md`.\n',
      );
      fs.writeFileSync(path.join(skillDir, 'references', 'grammar.md'), '# G\n');
      const findings = runConformance(await loadCatalog(root), getAllTargets(), { ruleId: RULE });
      assert.deepEqual(
        findings.map(f => f.severity),
        ['error'],
      );
      applyMechanicalFindings(findings, {
        catalog: await loadCatalog(root),
        targets: getAllTargets(),
      });
      assert.match(
        fs.readFileSync(skillMd, 'utf8'),
        /\[`references\/grammar\.md`\]\(references\/grammar\.md\)/,
      );
      const after = runConformance(await loadCatalog(root), getAllTargets(), { ruleId: RULE });
      assert.deepEqual(after, []);
    });
  });
});
