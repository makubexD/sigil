/**
 * Tests for the OpenCode target's citations and body lexicon — each lexicon term is
 * translated, the shared skill files keep Codex's values, and every citation points at
 * OpenCode's docs and carries a dated verification.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LEXICON_TERMS } from '../../dist-cli/targets/lexicon';
import { CODEX_LEXICON } from '../../dist-cli/targets/codex/lexicon';
import { OPENCODE_LEXICON } from '../../dist-cli/targets/opencode/lexicon';
import * as opencodeDocRefs from '../../dist-cli/targets/opencode/doc-refs';

describe('OPENCODE_LEXICON', () => {
  it('has a non-empty value for every LEXICON_TERMS key', () => {
    for (const term of LEXICON_TERMS) {
      assert.ok(OPENCODE_LEXICON[term].value.length > 0, `${term} has an empty value`);
    }
  });

  it('matches CODEX_LEXICON, since the skill files are shared', () => {
    for (const term of LEXICON_TERMS) {
      assert.equal(OPENCODE_LEXICON[term].value, CODEX_LEXICON[term].value, term);
    }
  });
});

describe('OpenCode DocRefs', () => {
  it('point at https://opencode.ai/docs/ with a valid verifiedOn date', () => {
    const refs = Object.values(opencodeDocRefs);
    assert.ok(refs.length > 0, 'no DocRefs exported');
    for (const ref of refs) {
      assert.ok(ref.url.startsWith('https://opencode.ai/docs/'), ref.url);
      assert.match(ref.verifiedOn, /^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
