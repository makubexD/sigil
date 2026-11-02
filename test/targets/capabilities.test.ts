/**
 * Per-target capability tables (src/targets/<provider>/capabilities.ts) — the single declaration
 * of which artifact kinds a target emits on each delivery channel (docs/decisions/
 * distribution-channels-2026-09.md §5). The expected sets below are the hand-listed values that
 * existed before the table (CLAUDE_SUPPORTED_KINDS, COPILOT_SUPPORTED_KINDS, and the plugin
 * assembler's skill/agent/workflow filter) — this refactor must not change any of them. Prompts
 * joined the plugin channel later, once they had their own plugin-channel emit spec.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  channelFromNativeKinds,
  kindSupport,
  nativeKinds,
  supportedKinds,
  supportsKind,
} from '../../dist-cli/targets/capabilities';
import { renderCapabilityMatrix } from '../../dist-cli/targets/capability-matrix';
import { ClaudeCodeTarget, CopilotTarget, getAllTargets } from '../../dist-cli/targets';
import { TestFixtureTarget } from '../../dist-cli/targets/test-fixture';
import { ALL_KINDS, CONFIG_KINDS } from '../../dist-cli/kinds';
import {
  WRITABLE_PLUGIN_KINDS,
  pluginMembersByKind,
} from '../../dist-cli/targets/claude-code/plugin-assemble';
import { visibleArtifacts } from '../../dist-cli/wizard/steps/add/state';
import { packContentHint } from '../../dist-cli/wizard/steps/add/options';
import { loadResolvedCatalog } from '../helpers/catalog';
import type { Pack, Target } from '../../dist-cli/types';
import { CHANNELS } from '../../dist-cli/targets/capability-types';

const CLAUDE = new ClaudeCodeTarget();
const COPILOT = new CopilotTarget();
const FIXTURE = new TestFixtureTarget();
const CAPABILITIES_DOC = path.resolve(__dirname, '../../docs/reference/capabilities.md');

const sorted = (kinds: readonly string[]) => [...kinds].sort();

describe('target capabilities — behaviour preserved from the hand-listed kinds', () => {
  it('should keep every kind supported on the claude scaffold channel', () => {
    assert.deepEqual(
      sorted(supportedKinds(CLAUDE)),
      sorted(['skill', 'agent', 'rule', 'prompt', 'workflow', 'hook', 'settings', 'mcp']),
    );
  });

  it('should keep copilot scaffold free of the Claude-only settings kind', () => {
    assert.deepEqual(
      sorted(supportedKinds(COPILOT)),
      sorted(['skill', 'agent', 'rule', 'prompt', 'workflow', 'mcp', 'hook']),
    );
  });

  it('should emit skill, agent, workflow, prompt, hook and mcp as claude plugin members', () => {
    assert.deepEqual(sorted(nativeKinds(CLAUDE, 'plugin')), [
      'agent',
      'hook',
      'mcp',
      'prompt',
      'skill',
      'workflow',
    ]);
  });

  it('should count rules as delivered to plugins, inlined into skills rather than as members', () => {
    assert.deepEqual(sorted(supportedKinds(CLAUDE, 'plugin')), [
      'agent',
      'hook',
      'mcp',
      'prompt',
      'rule',
      'skill',
      'workflow',
    ]);
    assert.equal(kindSupport(CLAUDE, 'rule', 'plugin')?.mode, 'via');
  });

  it('should report no plugin kinds for a target without a plugin channel', () => {
    assert.deepEqual(supportedKinds(COPILOT, 'plugin'), []);
    assert.equal(kindSupport(COPILOT, 'skill', 'plugin'), undefined);
  });

  it('should restrict the test fixture to skills', () => {
    assert.deepEqual(supportedKinds(FIXTURE), ['skill']);
    assert.equal(supportsKind(FIXTURE, 'rule'), false);
    assert.equal(supportsKind(FIXTURE, 'skill'), true);
  });

  it('should reject a string that is not an artifact kind', () => {
    assert.equal(supportsKind(CLAUDE, 'not-a-kind'), false);
  });
});

describe('target capabilities — table integrity', () => {
  const channelsOf = (t: Target) =>
    CHANNELS.flatMap(channel => {
      const table = t.capabilities[channel];
      return table ? [[channel, table] as const] : [];
    });

  it('should declare every artifact kind on every channel of every target', () => {
    for (const target of [CLAUDE, COPILOT, FIXTURE]) {
      for (const [channel, table] of channelsOf(target)) {
        assert.deepEqual(
          sorted(Object.keys(table)),
          sorted(ALL_KINDS),
          `${target.name}/${channel}`,
        );
      }
    }
  });

  it('should give every unsupported kind a reason and every via-kind a citation', () => {
    for (const target of [CLAUDE, COPILOT, FIXTURE]) {
      for (const [channel, table] of channelsOf(target)) {
        for (const kind of ALL_KINDS) {
          const support = table[kind];
          const where = `${target.name}/${channel}/${kind}`;
          if (support.mode === 'none') assert.ok(support.reason.length > 0, `${where} reason`);
          if (support.mode === 'via') assert.ok(support.docs.length > 0, `${where} docs`);
        }
      }
    }
  });

  it('should build a channel from a native-kind list with every other kind unsupported', () => {
    const channel = channelFromNativeKinds(['skill'], 'not built');

    assert.deepEqual(channel.skill, { mode: 'native' });
    assert.deepEqual(channel.rule, { mode: 'none', reason: 'not built' });
    assert.deepEqual(sorted(Object.keys(channel)), sorted(ALL_KINDS));
  });
});

describe('target config kinds — the table matches the native scaffold rows', () => {
  const nativeConfigKinds = (t: Target) => nativeKinds(t).filter(kind => CONFIG_KINDS.has(kind));

  it('should declare a config kind exactly when its scaffold row is native', () => {
    const declaring = getAllTargets().filter(target => target.configKinds !== undefined);

    assert.ok(declaring.length > 0, 'no registered target declares configKinds');
    for (const target of declaring) {
      assert.deepEqual(
        Object.keys(target.configKinds ?? {}).sort(),
        sorted(nativeConfigKinds(target)),
        `${target.name} configKinds`,
      );
    }
  });
});

describe('docs/reference/capabilities.md', () => {
  it('should match the matrix rendered from the registered targets (run npm run build)', () => {
    const committed = fs.readFileSync(CAPABILITIES_DOC, 'utf-8');

    assert.equal(committed, renderCapabilityMatrix(getAllTargets()));
  });
});

describe('claude plugin assembler ↔ plugin capability rows', () => {
  it('should have a writer for every kind the plugin channel marks native', () => {
    for (const kind of nativeKinds(CLAUDE, 'plugin')) {
      assert.ok(WRITABLE_PLUGIN_KINDS.has(kind), `no plugin writer for native kind '${kind}'`);
    }
  });

  it('should fail fast when a native plugin kind has no writer', () => {
    const ruleIsNative = {
      plugin: channelFromNativeKinds(['rule'], 'x'),
      scaffold: channelFromNativeKinds([], 'x'),
    };

    assert.throws(() => pluginMembersByKind([], ruleIsNative), /no writer/);
  });
});

describe('add wizard — visibleArtifacts follows the chosen target', () => {
  const stateFor = async (
    target: string | undefined,
    scaffoldableTargets: Target[] = [CLAUDE, COPILOT, FIXTURE],
  ) => ({
    ctx: {
      catalog: await loadResolvedCatalog(),
      packs: [],
      detectedTarget: 'claude',
      projectDir: '/fake',
      scaffoldableTargets,
    },
    ...(target ? { target } : {}),
  });
  const kindsOf = (artifacts: readonly { kind: string }[]) => new Set(artifacts.map(a => a.kind));

  it('should show the whole catalog before a target is chosen', async () => {
    const s = await stateFor(undefined);

    assert.equal(visibleArtifacts(s).length, s.ctx.catalog.artifacts.length);
  });

  it('should hide the Claude-only settings kind when copilot is chosen', async () => {
    const kinds = kindsOf(visibleArtifacts(await stateFor('copilot')));

    assert.ok(!kinds.has('settings'));
    assert.ok(kinds.has('skill') && kinds.has('mcp') && kinds.has('hook'));
  });

  it('should show only skills for the skill-only fixture target', async () => {
    assert.deepEqual([...kindsOf(visibleArtifacts(await stateFor('test-fixture')))], ['skill']);
  });

  const idsOf = (artifacts: readonly { id: string }[]) => artifacts.map(a => a.id).sort();

  const firstHookId = (catalog: { artifacts: readonly { kind: string; id: string }[] }) => {
    const hook = catalog.artifacts.find(a => a.kind === 'hook');
    assert.ok(hook, 'the catalog holds at least one hook');
    return hook.id;
  };

  /** A copy of a real target that refuses one catalog hook — no real target's behaviour is assumed. */
  const refusingTarget = (hookId: string): Target =>
    ({
      ...CLAUDE,
      configSkipReason: (a: { id: string }) => (a.id === hookId ? 'probe' : undefined),
    }) as unknown as Target;

  it('should hide a config artifact the chosen target refuses', async () => {
    const catalog = await loadResolvedCatalog();
    const hookId = firstHookId(catalog);
    const all = idsOf(visibleArtifacts(await stateFor('claude')));
    const visible = visibleArtifacts(
      await stateFor('claude', [refusingTarget(hookId), COPILOT, FIXTURE]),
    );

    assert.deepEqual(
      visible.map(a => a.id).sort(),
      all.filter(id => id !== hookId),
    );
  });

  it('should keep every artifact for an unmodified target', async () => {
    const catalog = await loadResolvedCatalog();
    const hookId = firstHookId(catalog);
    const unmodified = idsOf(visibleArtifacts(await stateFor('claude')));
    const refused = idsOf(
      visibleArtifacts(await stateFor('claude', [refusingTarget(hookId), COPILOT, FIXTURE])),
    );

    assert.ok(unmodified.includes(hookId));
    assert.deepEqual(unmodified, [...refused, hookId].sort());
  });

  it('should not count a refused config artifact in a pack hint', async () => {
    const catalog = await loadResolvedCatalog();
    const hookId = firstHookId(catalog);
    const pack: Pack = {
      name: 'probe-pack',
      displayName: 'Probe Pack',
      description: 'A pack holding one hook.',
      artifacts: [hookId],
    };

    assert.equal(packContentHint(pack, catalog, [pack], CLAUDE), '1 hook');
    assert.equal(packContentHint(pack, catalog, [pack], refusingTarget(hookId)), pack.displayName);
  });

  it('should count a config artifact in a pack hint before a target is chosen', async () => {
    const catalog = await loadResolvedCatalog();
    const hookId = firstHookId(catalog);
    const pack: Pack = {
      name: 'probe-pack',
      displayName: 'Probe Pack',
      description: 'A pack holding one hook.',
      artifacts: [hookId],
    };

    assert.equal(packContentHint(pack, catalog, [pack], undefined), '1 hook');
  });
});
