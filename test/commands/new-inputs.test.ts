/**
 * Tests for src/commands/new-inputs.ts — input resolution for `sigil new`
 * (wizard vs. flags dispatch, kind/platforms validation).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveFlagsInputs,
  resolveWizardInputs,
  type NewOptions,
} from '../../dist-cli/commands/new-inputs';
import { ALL_KINDS } from '../../dist-cli/kinds';
import { SigilError } from '../../dist-cli/errors';

const VALID_KINDS = ALL_KINDS as readonly string[];

function makeOpts(overrides: Partial<NewOptions> = {}): NewOptions {
  return { catalogDir: '/fake/catalog', ...overrides };
}

describe('resolveFlagsInputs', () => {
  it('returns the effective-inputs shape for a valid kind', () => {
    const result = resolveFlagsInputs('rule', makeOpts({ name: 'my-rule' }), VALID_KINDS);
    assert.equal(result.kind, 'rule');
    assert.equal(result.name, 'my-rule');
    assert.equal(result.platforms, undefined);
  });

  it('throws SigilError when no kind is provided', () => {
    assert.throws(
      () => resolveFlagsInputs(undefined, makeOpts(), VALID_KINDS),
      (err: unknown) => err instanceof SigilError && /No kind specified/.test(err.message),
    );
  });

  it('throws SigilError for an unknown kind', () => {
    assert.throws(
      () => resolveFlagsInputs('not-a-real-kind', makeOpts(), VALID_KINDS),
      (err: unknown) => err instanceof SigilError && /Unknown kind/.test(err.message),
    );
  });

  it('parses a valid comma-separated --platforms flag into a normalized array', () => {
    const result = resolveFlagsInputs('rule', makeOpts({ platforms: 'claude' }), VALID_KINDS);
    assert.ok(Array.isArray(result.platforms));
    assert.ok(result.platforms!.includes('claude'));
  });

  it('throws SigilError for an unknown platform in --platforms', () => {
    assert.throws(
      () => resolveFlagsInputs('rule', makeOpts({ platforms: 'not-a-real-platform' }), VALID_KINDS),
      (err: unknown) => err instanceof SigilError && /Invalid --platforms/.test(err.message),
    );
  });

  it('leaves platforms undefined when --platforms was not passed', () => {
    const result = resolveFlagsInputs('rule', makeOpts(), VALID_KINDS);
    assert.equal(result.platforms, undefined);
  });
});

describe('resolveWizardInputs', () => {
  it('throws the no-TTY SigilError immediately when not in an interactive terminal', async () => {
    await assert.rejects(
      resolveWizardInputs(makeOpts(), false, VALID_KINDS),
      (err: unknown) =>
        err instanceof SigilError && /not an interactive terminal/.test(err.message),
    );
  });
});
