/**
 * Tests for src/targets/prompt-args.ts — placeholder translation and argument hint.
 * All pure functions; no catalog or filesystem needed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  toClaudePlaceholders,
  toCopilotPlaceholders,
  buildArgumentHint,
} from '../../dist-cli/targets/prompt-args';
import type { PromptArg } from '../../dist-cli/targets/prompt-args';

describe('toClaudePlaceholders', () => {
  it('translates {{name}} to $name', () => {
    assert.equal(toClaudePlaceholders('Give me {{diff}}'), 'Give me $diff');
  });

  it('translates multiple placeholders', () => {
    assert.equal(
      toClaudePlaceholders('Diff: {{diff}}\nAudience: {{audience}}'),
      'Diff: $diff\nAudience: $audience',
    );
  });

  it('tolerates inner whitespace ({{ diff }})', () => {
    assert.equal(toClaudePlaceholders('{{ diff }}'), '$diff');
  });

  it('leaves text with no placeholders unchanged', () => {
    const body = 'No substitution needed here.';
    assert.equal(toClaudePlaceholders(body), body);
  });
});

describe('toCopilotPlaceholders', () => {
  it('translates {{name}} to ${input:name}', () => {
    assert.equal(toCopilotPlaceholders('Give me {{diff}}'), 'Give me ${input:diff}');
  });

  it('translates multiple placeholders', () => {
    assert.equal(
      toCopilotPlaceholders('Diff: {{diff}}\nAudience: {{audience}}'),
      'Diff: ${input:diff}\nAudience: ${input:audience}',
    );
  });

  it('tolerates inner whitespace ({{ diff }})', () => {
    assert.equal(toCopilotPlaceholders('{{ diff }}'), '${input:diff}');
  });

  it('leaves text with no placeholders unchanged', () => {
    const body = 'No substitution needed here.';
    assert.equal(toCopilotPlaceholders(body), body);
  });
});

describe('buildArgumentHint', () => {
  it('formats required args as [name]', () => {
    const args: PromptArg[] = [{ name: 'diff', required: true }, { name: 'audience' }];
    assert.equal(buildArgumentHint(args), '[diff] [audience]');
  });

  it('returns empty string for no args', () => {
    assert.equal(buildArgumentHint([]), '');
  });

  it('single arg', () => {
    assert.equal(buildArgumentHint([{ name: 'file' }]), '[file]');
  });
});
