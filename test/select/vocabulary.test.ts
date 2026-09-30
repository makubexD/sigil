/**
 * Tests for src/select/vocabulary.ts — per-platform kind noun/plural/hint helpers.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { kindNoun, kindPlural, kindHint } from '../../dist-cli/select/index';
import { ClaudeCodeTarget } from '../../dist-cli/targets/claude-code';
import { CopilotTarget } from '../../dist-cli/targets/copilot';

describe('kindNoun / kindPlural / kindHint (per-AI vocabulary)', () => {
  it('prompt → command on Claude Code', () => {
    const target = new ClaudeCodeTarget();
    assert.equal(kindNoun(target, 'prompt'), 'command', 'Claude: prompt noun is command');
    assert.equal(kindPlural(target, 'prompt'), 'Commands', 'Claude: prompt plural is Commands');
  });

  it('rule → instructions on Copilot', () => {
    const target = new CopilotTarget();
    assert.equal(kindNoun(target, 'rule'), 'instructions', 'Copilot: rule noun is instructions');
    assert.equal(
      kindPlural(target, 'rule'),
      'Instructions',
      'Copilot: rule plural is Instructions',
    );
  });

  it('prompt → prompt on Copilot (stays neutral)', () => {
    const target = new CopilotTarget();
    assert.equal(kindNoun(target, 'prompt'), 'prompt', 'Copilot: prompt stays prompt');
    assert.equal(kindPlural(target, 'prompt'), 'Prompts', 'Copilot: prompt plural is Prompts');
  });

  it('skill stays skill on both platforms', () => {
    const claude = new ClaudeCodeTarget();
    const copilot = new CopilotTarget();
    assert.equal(kindNoun(claude, 'skill'), 'skill', 'Claude: skill stays skill');
    assert.equal(kindNoun(copilot, 'skill'), 'skill', 'Copilot: skill stays skill');
  });

  it('fallback: undefined target returns raw catalog kind', () => {
    assert.equal(kindNoun(undefined, 'prompt'), 'prompt', 'no target: raw kind returned');
    assert.equal(kindNoun(undefined, 'rule'), 'rule', 'no target: raw kind returned');
    assert.equal(kindPlural(undefined, 'skill'), 'Skills', 'no target: simple plural fallback');
  });

  it('fallback: unmapped kind returns raw kind / simple plural', () => {
    const target = new ClaudeCodeTarget();
    assert.equal(kindNoun(target, 'some-new-kind'), 'some-new-kind', 'unmapped kind: raw noun');
    assert.equal(
      kindPlural(target, 'some-new-kind'),
      'Some-new-kinds',
      'unmapped kind: simple plural',
    );
  });

  it('kindHint returns platform-specific hint when declared', () => {
    const claude = new ClaudeCodeTarget();
    const copilot = new CopilotTarget();
    assert.ok(
      kindHint(claude, 'prompt')?.includes('command'),
      'Claude command hint mentions command',
    );
    assert.ok(
      kindHint(copilot, 'rule')?.includes('instructions'),
      'Copilot rule hint mentions instructions',
    );
    assert.equal(kindHint(undefined, 'skill'), undefined, 'no target: no hint');
  });
});
