/**
 * Per-target capability tables (src/targets/<provider>/capabilities.ts) — the single declaration
 * of which artifact kinds a target emits on each delivery channel (docs/decisions/
 * distribution-channels-2026-09.md §5). The expected sets below are the hand-listed values that
 * existed before the table (CLAUDE_SUPPORTED_KINDS, COPILOT_SUPPORTED_KINDS, and the plugin
 * assembler's skill/agent/workflow filter) — this refactor must not change any of them.
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
import { ALL_KINDS } from '../../dist-cli/kinds';
import {
  WRITABLE_PLUGIN_KINDS,
  pluginMembersByKind,
} from '../../dist-cli/targets/claude-code/plugin-assemble';
import { visibleArtifacts } from '../../dist-cli/wizard/steps/add/state';
import { loadResolvedCatalog } from '../helpers/catalog';
import type { Target } from '../../dist-cli/types';
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

  it('should keep copilot scaffold free of the Claude-only hook/settings kinds', () => {
    assert.deepEqual(
      sorted(supportedKinds(COPILOT)),
      sorted(['skill', 'agent', 'rule', 'prompt', 'workflow', 'mcp']),
    );
  });

  it('should emit only skill, agent and workflow as claude plugin members', () => {
    assert.deepEqual(sorted(nativeKinds(CLAUDE, 'plugin')), ['agent', 'skill', 'workflow']);
  });

  it('should count rules as delivered to plugins, inlined into skills rather than as members', () => {
    assert.deepEqual(sorted(supportedKinds(CLAUDE, 'plugin')), [
      'agent',
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
  const stateFor = async (target: string | undefined) => ({
    ctx: {
      catalog: await loadResolvedCatalog(),
      packs: [],
      detectedTarget: 'claude',
      projectDir: '/fake',
      scaffoldableTargets: [CLAUDE, COPILOT, FIXTURE],
    },
    ...(target ? { target } : {}),
  });
  const kindsOf = (artifacts: readonly { kind: string }[]) => new Set(artifacts.map(a => a.kind));

  it('should show the whole catalog before a target is chosen', async () => {
    const s = await stateFor(undefined);

    assert.equal(visibleArtifacts(s).length, s.ctx.catalog.artifacts.length);
  });

  it('should hide Claude-only config kinds when copilot is chosen', async () => {
    const kinds = kindsOf(visibleArtifacts(await stateFor('copilot')));

    assert.ok(!kinds.has('hook') && !kinds.has('settings'));
    assert.ok(kinds.has('skill') && kinds.has('mcp'));
  });

  it('should show only skills for the skill-only fixture target', async () => {
    assert.deepEqual([...kindsOf(visibleArtifacts(await stateFor('test-fixture')))], ['skill']);
  });
});
