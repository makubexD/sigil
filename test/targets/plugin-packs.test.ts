/**
 * Pack membership helpers shared by every plugin-building target. A target never imports another
 * target's assembler, so these live in src/targets/shared/plugin-packs.ts: the generated plugin
 * name for a config-kind artifact, the artifacts a pack holds, and the shared-agent closure its
 * skills pull in.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  configPluginName,
  getPackArtifacts,
  computeSharedAgentIds,
} from '../../dist-cli/targets/shared/plugin-packs';
import type { Pack, ResolvedArtifact, ResolvedCatalog } from '../../dist-cli/types';

/** A resolved artifact with only the fields a test cares about. */
function artifact(
  id: string,
  kind: ResolvedArtifact['kind'],
  extra: Partial<ResolvedArtifact> = {},
): ResolvedArtifact {
  return { id, kind, filePath: `${id}.md`, frontmatter: {}, body: '', ...extra };
}

/** A resolved catalog holding exactly `artifacts`. */
function catalogOf(artifacts: ResolvedArtifact[]): ResolvedCatalog {
  return {
    artifacts,
    byId: new Map(artifacts.map(a => [a.id, a])),
    languages: new Map(),
  };
}

/** A pack made of explicit catalog ids. */
function packOf(name: string, extra: Partial<Pack> = {}): Pack {
  return { name, displayName: name, description: `The ${name} pack.`, ...extra };
}

describe('configPluginName', () => {
  it('should name a config artifact after its kind and basename', () => {
    assert.equal(
      configPluginName({ id: 'shared/protect-config', kind: 'hook' }),
      'hook-protect-config',
    );
  });
});

describe('getPackArtifacts', () => {
  it('should keep the explicit list order and drop pluginExclude ids', () => {
    const a = artifact('shared/a', 'skill');
    const b = artifact('shared/b', 'skill');
    const c = artifact('shared/c', 'skill');
    const pack = packOf('explicit', {
      artifacts: ['shared/a', 'shared/b', 'shared/c'],
      pluginExclude: ['shared/b'],
    });

    const selected = getPackArtifacts(pack, catalogOf([a, b, c]));

    assert.deepEqual(
      selected.map(s => s.id),
      ['shared/a', 'shared/c'],
    );
  });

  it('should select by language when the pack lists no artifacts', () => {
    const python = artifact('shared/python-rule', 'rule', { frontmatter: { language: 'python' } });
    const rust = artifact('shared/rust-rule', 'rule', { frontmatter: { language: 'rust' } });
    const neutral = artifact('shared/neutral-rule', 'rule');
    const pack = packOf('python-pack', { languages: ['python'] });

    const selected = getPackArtifacts(pack, catalogOf([python, rust, neutral]));

    assert.deepEqual(
      selected.map(s => s.id),
      ['shared/python-rule'],
    );
  });
});

describe('computeSharedAgentIds', () => {
  it('should add a skill-used agent outside the pack and skip excluded ids', () => {
    const x = artifact('shared/x', 'agent');
    const skill = artifact('shared/skill', 'skill', {
      resolvedAgentIds: ['shared/x', 'shared/y', 'shared/z'],
    });
    const installSet = new Set<string>();

    const sharedAgentIds = computeSharedAgentIds([skill], [x], new Set(['shared/z']), installSet);

    assert.deepEqual([...sharedAgentIds], ['shared/y']);
    assert.ok(installSet.has('shared/y'), 'install set gains the shared agent');
    assert.ok(!sharedAgentIds.has('shared/z'), 'excluded id stays out of the result');
    assert.ok(!installSet.has('shared/z'), 'excluded id stays out of the install set');
    assert.ok(!sharedAgentIds.has('shared/x'), 'an agent already in the pack is not shared');
    assert.ok(!installSet.has('shared/x'), 'an agent already in the pack is not added again');
  });
});
