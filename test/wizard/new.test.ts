/**
 * Tests for src/wizard/new.ts — buildEquivalentNewCommand helper.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEquivalentNewCommand } from '../../dist-cli/wizard';

describe('E5 — buildEquivalentNewCommand', () => {
  it('includes kind and --name always', () => {
    const cmd = buildEquivalentNewCommand({ kind: 'rule', name: 'my-rule' });
    assert.ok(cmd.startsWith('sigil new rule'), 'starts with new rule');
    assert.ok(cmd.includes('--name my-rule'), '--name present');
    assert.ok(cmd.endsWith('--yes'), 'ends with --yes');
  });

  it('omits --language when shared (undefined)', () => {
    const cmd = buildEquivalentNewCommand({ kind: 'agent', name: 'sql-reviewer' });
    assert.ok(!cmd.includes('--language'), '--language absent when shared');
  });

  it('includes --language when specified', () => {
    const cmd = buildEquivalentNewCommand({ kind: 'skill', name: 'ef-core', language: 'csharp' });
    assert.ok(cmd.includes('--language csharp'), '--language present');
  });

  it('omits --platforms when unrestricted (undefined)', () => {
    const cmd = buildEquivalentNewCommand({ kind: 'prompt', name: 'my-prompt' });
    assert.ok(!cmd.includes('--platforms'), '--platforms absent when unrestricted');
  });

  it('includes --platforms when restricted', () => {
    const cmd = buildEquivalentNewCommand({
      kind: 'rule',
      name: 'my-rule',
      platforms: ['claude'],
    });
    assert.ok(cmd.includes('--platforms claude'), '--platforms present when restricted');
  });

  it('joins multiple platforms with comma', () => {
    const cmd = buildEquivalentNewCommand({
      kind: 'agent',
      name: 'rev',
      platforms: ['claude', 'copilot'],
    });
    assert.ok(cmd.includes('--platforms claude,copilot'), 'multiple platforms comma-joined');
  });
});
