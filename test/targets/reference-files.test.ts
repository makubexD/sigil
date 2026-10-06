/**
 * A skill's reference files ship next to its SKILL.md on every target, so they get what the body
 * gets: the target's lexicon, the output contract (no untranslated token, no other provider's
 * literal), and the leak checks in `sync --check`. Before this, references were copied byte for
 * byte and no check read them.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { emitFile, specFor } from '../../dist-cli/targets/emit-files';
import { getAllTargets } from '../../dist-cli/targets/index';
import { contractsFor } from '../../dist-cli/targets/all-emit-specs';
import { checkOutputContract } from '../../dist-cli/targets/output-contract';
import { loadCatalog } from '../../dist-cli/load';
import { runConformance } from '../../dist-cli/commands/sync/conformance/detect';
import { applyMechanicalFindings } from '../../dist-cli/commands/sync/conformance/fix-mechanical';
import { loadResolvedCatalog } from '../helpers/catalog';
import { withTempDirAsync } from '../helpers/temp-dir';

const TOKEN_TEXT = 'Read {sigil:conventions-file} first.\n';
const CHANNELS = ['scaffold', 'plugin'] as const;

/** A real skill from the bundled catalog, carrying one reference with `content`. */
async function skillWithReference(content: string) {
  const catalog = await loadResolvedCatalog();
  const skill = catalog.artifacts.find(a => a.kind === 'skill' && !a.references?.length)!;
  return { catalog, skill: { ...skill, references: [{ name: 'probe.md', content }] } };
}

/** Writes one skill whose reference file holds `reference`; returns the catalog root. */
function writeSkill(root: string, reference: string): string {
  const dir = path.join(root, 'shared', 'skills', 'probe');
  fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    '---\nid: shared/probe\nkind: skill\nname: probe\ntitle: P\ndescription: A probe.\n---\n\n' +
      'Read [the probe](references/probe.md).\n',
  );
  const file = path.join(dir, 'references', 'probe.md');
  fs.writeFileSync(file, reference);
  return file;
}

describe('reference files', () => {
  it("should translate lexicon tokens in reference files on every target's skill spec", async () => {
    const { catalog, skill } = await skillWithReference(TOKEN_TEXT);
    for (const target of getAllTargets().filter(t => t.emitSpecs)) {
      for (const channel of CHANNELS) {
        const spec = specFor(target.emitSpecs!, 'skill', channel);
        if (!spec) continue;
        const files: Record<string, string> = {};
        emitFile(spec, skill, { catalog, installSet: new Set([skill.id]) }, files);
        const [refPath, content] = Object.entries(files).find(([p]) => p.endsWith('/probe.md'))!;
        assert.doesNotMatch(content, /\{sigil:/, `${target.name}/${channel}: ${refPath}`);
      }
    }
  });

  it("should hold reference files to every target's output contract", async () => {
    const { catalog, skill } = await skillWithReference(TOKEN_TEXT);
    for (const target of getAllTargets().filter(t => t.emitSpecs)) {
      const spec = specFor(target.emitSpecs!, 'skill', 'scaffold')!;
      const files: Record<string, string> = {};
      emitFile(spec, skill, { catalog, installSet: new Set([skill.id]) }, files);
      const refPath = Object.keys(files).find(p => p.endsWith('/probe.md'))!;
      const raw = { [refPath]: TOKEN_TEXT };
      const violations = checkOutputContract(raw, contractsFor(target));
      assert.ok(violations.length > 0, `${target.name}: ${refPath} is not checked`);
    }
  });

  it('should report and fix a provider literal in a reference file, keeping it frontmatter-free', async () => {
    await withTempDirAsync(async root => {
      const file = writeSkill(root, 'Read CLAUDE.md first.\n');
      const catalog = await loadCatalog(root);
      const findings = runConformance(catalog, getAllTargets(), { ruleId: 'provider-term-leak' });
      assert.equal(findings.length, 1, findings.map(f => f.detail).join('\n'));
      assert.equal(findings[0]!.filePath, file);
      applyMechanicalFindings(findings, { catalog, targets: getAllTargets() });
      assert.equal(fs.readFileSync(file, 'utf8'), 'Read {sigil:conventions-file} first.\n');
    });
  });

  it("should report another provider's private folder in a reference file", async () => {
    await withTempDirAsync(async root => {
      const file = writeSkill(root, 'Look under .claude/ for rules.\n');
      const catalog = await loadCatalog(root);
      const findings = runConformance(catalog, getAllTargets(), { ruleId: 'platform-path-leak' });
      assert.ok(findings.length > 0, 'no finding');
      assert.ok(findings.every(f => f.filePath === file));
    });
  });
});
