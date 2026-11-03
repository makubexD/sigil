/**
 * The wizard's pack hint and picker list count only what `add` would install, for every reason an
 * artifact is skipped — not only a config kind the target refuses. Antigravity never writes a
 * scoped `trigger: glob` rule (its rule spec's `skipReason`), so a pack whose rules are all scoped
 * shows no Rules part and leaves those rules out of the picker; Cursor writes them, so it keeps
 * both.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parsePacksConfig } from '../../dist-cli/packs-config';
import { getTarget } from '../../dist-cli/targets';
import { packContentHint } from '../../dist-cli/wizard/steps/add/options';
import { visibleArtifacts } from '../../dist-cli/wizard/steps/add/state';
import type { AddWizardState } from '../../dist-cli/wizard/steps/add/state';
import { loadResolvedCatalog } from '../helpers/catalog';
import type { Pack, ResolvedCatalog, Target } from '../../dist-cli/types';

const PACKS_FILE = path.resolve(__dirname, '../../packs.yaml');
const PACK_NAME = 'dotnet-tooling';

const loadPacks = (): Pack[] =>
  parsePacksConfig(fs.readFileSync(PACKS_FILE, 'utf8'), PACKS_FILE).packs;

const stateFor = (catalog: ResolvedCatalog, packs: Pack[], target: Target): AddWizardState => ({
  ctx: {
    catalog,
    packs,
    detectedTarget: target.name,
    projectDir: '/fake',
    scaffoldableTargets: [target],
  },
  target: target.name,
});

const idsOf = (artifacts: readonly { id: string }[]): Set<string> =>
  new Set(artifacts.map(a => a.id));

describe('the wizard counts and lists only what add installs', async () => {
  const catalog = await loadResolvedCatalog();
  const packs = loadPacks();
  const pack = packs.find(p => p.name === PACK_NAME);
  assert.ok(pack, `packs.yaml holds the ${PACK_NAME} pack`);

  /** Every C# rule is scoped (`appliesTo` is narrower than every file). */
  const csharpRules = catalog.artifacts.filter(
    a => a.kind === 'rule' && a.frontmatter.language === 'csharp',
  );

  it('should give a scoped-rule pack no Rules part on Antigravity', () => {
    assert.ok(csharpRules.length > 0, 'the catalog holds C# rules');

    const hint = packContentHint(pack, catalog, packs, getTarget('antigravity'));

    assert.doesNotMatch(hint, /\brules?\b/i);
  });

  it('should still give the same pack a Rules part on Cursor', () => {
    const hint = packContentHint(pack, catalog, packs, getTarget('cursor'));

    assert.match(hint, /\bRules\b/);
  });

  it('should leave scoped rules out of the Antigravity picker', () => {
    const visible = idsOf(visibleArtifacts(stateFor(catalog, packs, getTarget('antigravity'))));

    for (const rule of csharpRules) assert.ok(!visible.has(rule.id), rule.id);
  });

  it('should keep scoped rules in the Cursor picker', () => {
    const visible = idsOf(visibleArtifacts(stateFor(catalog, packs, getTarget('cursor'))));

    for (const rule of csharpRules) assert.ok(visible.has(rule.id), rule.id);
  });
});
