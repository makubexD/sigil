/**
 * Catalog doctrine stays consistent across every artifact an agent can receive. Each doctrine has
 * one home (`shared/clean-code` or a template); a retired wording must not survive anywhere else,
 * and a family that must carry a doctrine has it in every member's delivered text.
 *
 * Texts are read resolved (templates composed, `extends` bases prepended) plus each skill's
 * reference files, so the check sees what ships, not only the source body. Whitespace is collapsed
 * first so wrapped prose still matches. Background: docs/audits/2026-10-14.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalogStandard } from '../dist-cli/catalog-standard';
import type { ResolvedArtifact } from '../dist-cli/types';
import { CATALOG_DIR, loadResolvedCatalog } from './helpers/catalog';

interface Retired {
  readonly pattern: RegExp;
  readonly why: string;
}

interface Canonical {
  readonly family: string;
  readonly phrase: string;
}

const RETIRED: readonly Retired[] = [
  {
    pattern: /duplication is (a bug|worse than)/i,
    why: 'one duplication doctrine lives in shared/clean-code: a wrong abstraction costs more than duplication',
  },
  {
    pattern: /add the smallest correct version|\(a logger/i,
    why: 'licenses infrastructure the task did not ask for; say what is missing instead',
  },
];

const CANONICAL: readonly Canonical[] = [
  { family: 'code-quality', phrase: 'a wrong abstraction costs more than duplication' },
];

function flatten(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function deliveredTexts(artifact: ResolvedArtifact): string[] {
  const body = artifact.resolvedBody ?? artifact.body;
  return [body, ...(artifact.references ?? []).map(ref => ref.content)].map(flatten);
}

describe('catalog doctrine', () => {
  it('should not ship a retired wording in any artifact', async () => {
    const catalog = await loadResolvedCatalog();
    const hits = catalog.artifacts.flatMap(artifact =>
      RETIRED.filter(r => deliveredTexts(artifact).some(text => r.pattern.test(text))).map(
        r => `${artifact.id}: ${r.pattern} (${r.why})`,
      ),
    );
    assert.deepEqual(hits, []);
  });

  it('should carry each canonical doctrine in every member of its family', async () => {
    const catalog = await loadResolvedCatalog();
    const standard = loadCatalogStandard(CATALOG_DIR);
    assert.ok(standard, 'catalog/standard.yaml loads');
    const missing = CANONICAL.flatMap(({ family, phrase }) => {
      const members = standard.families.find(f => f.id === family)?.members ?? [];
      assert.ok(members.length > 0, `family ${family} has members`);
      return members
        .filter(id => {
          const artifact = catalog.byId.get(id);
          assert.ok(artifact, `${id} is in the catalog`);
          return !deliveredTexts(artifact).some(text => text.toLowerCase().includes(phrase));
        })
        .map(id => `${id}: missing "${phrase}"`);
    });
    assert.deepEqual(missing, []);
  });
});
