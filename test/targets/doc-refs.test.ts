/**
 * Tests for src/targets/all-emit-specs.ts — proves every provider spec (and the two hand-written
 * aggregates) actually carries a citation, and that `sigil sync --stale` has something real to
 * track. Nothing previously imported doc-refs.ts or a *_EMIT_SPECS array; this is that gate.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allProviderDocRefs } from '../../dist-cli/targets/all-emit-specs';
import { CLAUDE_EMIT_SPECS } from '../../dist-cli/targets/claude-code/spec';
import { COPILOT_EMIT_SPECS } from '../../dist-cli/targets/copilot/spec';

const VERIFIED_ON_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

describe('every KindEmitSpec carries at least one docs[] citation', () => {
  for (const [provider, specs] of [
    ['claude', CLAUDE_EMIT_SPECS],
    ['copilot', COPILOT_EMIT_SPECS],
  ] as const) {
    it(`should require docs[] on every ${provider} spec`, () => {
      // Arrange / Act — deriveContracts()-style iteration, but asserting on `docs` not contracts
      const missing = specs.filter(spec => spec.docs.length === 0);

      // Assert
      assert.deepEqual(
        missing.map(s => s.kind),
        [],
        `${provider} spec(s) with no docs[] citation: ${missing.map(s => s.kind).join(', ')}`,
      );
    });
  }
});

describe('allProviderDocRefs() — the sigil sync --stale input', () => {
  it('should include at least one entry per registered provider plus the two aggregates', () => {
    // Arrange
    const sources = allProviderDocRefs().map(ref => ref.source);

    // Act / Assert
    assert.ok(
      sources.some(s => s.startsWith('claude/')),
      'no claude spec citation found',
    );
    assert.ok(
      sources.some(s => s.startsWith('copilot/')),
      'no copilot spec citation found',
    );
    assert.ok(
      sources.includes('copilot copilot-instructions.md aggregate'),
      'copilot-instructions.md aggregate citation missing',
    );
    assert.ok(
      sources.includes('copilot AGENTS.md aggregate'),
      'AGENTS.md aggregate citation missing',
    );
  });

  it('should have a well-formed YYYY-MM-DD verifiedOn on every citation', () => {
    // Arrange
    const malformed = allProviderDocRefs().filter(
      ref => !VERIFIED_ON_FORMAT.test(ref.doc.verifiedOn),
    );

    // Assert
    assert.deepEqual(
      malformed.map(ref => ref.source),
      [],
      `citation(s) with malformed verifiedOn: ${malformed.map(ref => ref.source).join(', ')}`,
    );
  });
});
