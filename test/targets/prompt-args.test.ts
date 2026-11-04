/**
 * Tests for src/targets/prompt-args.ts — placeholder translation and argument hint.
 * All pure functions; no catalog or filesystem needed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  toClaudePlaceholders,
  toCopilotPlaceholders,
  fromCopilotPlaceholders,
  toPositionalPlaceholders,
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

describe('toPositionalPlaceholders', () => {
  it('translates each name to its 1-based position in args', () => {
    assert.equal(
      toPositionalPlaceholders('A {{x}} B {{y}}', [{ name: 'x' }, { name: 'y' }]),
      'A $1 B $2',
    );
  });

  it('uses the position in args, not the order in the body', () => {
    assert.equal(
      toPositionalPlaceholders('{{y}} then {{x}}', [{ name: 'x' }, { name: 'y' }]),
      '$2 then $1',
    );
  });

  it('translates a repeated placeholder each time', () => {
    assert.equal(toPositionalPlaceholders('{{x}} and {{x}}', [{ name: 'x' }]), '$1 and $1');
  });

  it('tolerates inner whitespace ({{ x }})', () => {
    assert.equal(toPositionalPlaceholders('{{ x }}', [{ name: 'x' }]), '$1');
  });

  it('leaves a name not in args as literal text', () => {
    assert.equal(toPositionalPlaceholders('{{other}}', [{ name: 'x' }]), '{{other}}');
  });

  it('leaves every name as literal text when args is undefined', () => {
    assert.equal(toPositionalPlaceholders('{{other}}', undefined), '{{other}}');
  });

  it('handles a hyphenated name', () => {
    assert.equal(toPositionalPlaceholders('{{a-b}}', [{ name: 'a-b' }]), '$1');
  });
});

describe('fromCopilotPlaceholders', () => {
  it('translates ${input:name} to {{name}} and de-duplicates args', () => {
    assert.deepEqual(fromCopilotPlaceholders('${input:a} ${input:a}'), {
      body: '{{a}} {{a}}',
      args: [{ name: 'a' }],
    });
  });

  it('keeps the hint after the second colon as the arg description', () => {
    assert.deepEqual(fromCopilotPlaceholders('${input:a:Pick one: x}'), {
      body: '{{a}}',
      args: [{ name: 'a', description: 'Pick one: x' }],
    });
  });

  it('leaves other VS Code variables as written', () => {
    assert.deepEqual(fromCopilotPlaceholders('${file}'), { body: '${file}', args: [] });
  });

  it('lists names once in first-seen order', () => {
    assert.deepEqual(fromCopilotPlaceholders('${input:b} ${input:a:b hint}').args, [
      { name: 'b' },
      { name: 'a', description: 'b hint' },
    ]);
  });

  it('round-trips a bare ${input:name} back through toCopilotPlaceholders', () => {
    const body = '${input:a}';
    assert.equal(toCopilotPlaceholders(fromCopilotPlaceholders(body).body), body);
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
