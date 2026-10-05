/**
 * `provider-term-leak`: a catalog body holding a provider's literal lexicon value (`CLAUDE.md`,
 * `AGENTS.md`, …) instead of the neutral `{sigil:<term>}` token. One finding per literal, and
 * `--apply` replaces exactly that literal, even when several providers or terms share a value.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../../dist-cli/load';
import { runConformance } from '../../dist-cli/commands/sync/conformance/detect';
import { applyMechanicalFindings } from '../../dist-cli/commands/sync/conformance/fix-mechanical';
import { getAllTargets } from '../../dist-cli/targets/index';
import { withTempDirAsync } from '../helpers/temp-dir';

const RULE = 'provider-term-leak';
const skill = (body: string) =>
  `---\nid: shared/probe\nkind: skill\nname: probe\ntitle: P\ndescription: A probe. Use when probing.\n---\n\n${body}\n`;

/** Writes one skill with `body`, then returns its findings and the body after --apply. */
async function leakAndFix(body: string): Promise<{ details: string[]; fixed: string }> {
  let result = { details: [] as string[], fixed: '' };
  await withTempDirAsync(async root => {
    const file = path.join(root, 'shared', 'skills', 'probe', 'SKILL.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, skill(body));
    const findings = runConformance(await loadCatalog(root), getAllTargets(), { ruleId: RULE });
    applyMechanicalFindings(findings, {
      catalog: await loadCatalog(root),
      targets: getAllTargets(),
    });
    const fixed = fs.readFileSync(file, 'utf8').split('---\n').slice(2).join('---\n').trim();
    result = { details: findings.map(f => f.detail), fixed };
  });
  return result;
}

describe('provider-term-leak', () => {
  it("should report and fix another tool's conventions file with the neutral token", async () => {
    const { details, fixed } = await leakAndFix('Read CLAUDE.md before you start.');
    assert.equal(details.length, 1, details.join('\n'));
    assert.equal(fixed, 'Read {sigil:conventions-file} before you start.');
  });

  it('should report a literal shared by several terms once, as the first term', async () => {
    // AGENTS.md is the conventions file on Copilot and the open standard, and the open
    // standard's rules location too: one finding, fixed to {sigil:conventions-file}.
    const { details, fixed } = await leakAndFix('Read AGENTS.md before you start.');
    assert.equal(details.length, 1, details.join('\n'));
    assert.match(details[0]!, /term='conventions-file'/);
    assert.equal(fixed, 'Read {sigil:conventions-file} before you start.');
  });
});
