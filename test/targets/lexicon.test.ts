/**
 * Tests for src/targets/lexicon.ts — `reverseLexicon` is the inverse of `applyLexicon`,
 * used by `sigil import` to turn provider prose back into neutral `{sigil:<term>}` tokens.
 * All pure functions; no catalog or filesystem needed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LEXICON_TERMS, applyLexicon, reverseLexicon } from '../../dist-cli/targets/lexicon';
import type { ProviderLexicon } from '../../dist-cli/targets/lexicon';
import { COPILOT_LEXICON } from '../../dist-cli/targets/copilot/lexicon';
import type { DocRef } from '../../dist-cli/targets/spec-types';

const PROBE_DOC: DocRef = {
  url: 'https://example.test/probe',
  title: 'Probe',
  verifiedOn: '2026-10-04',
  covers: 'probe',
};

/** `arguments` and `conventions-file` share a value; LEXICON_TERMS says conventions-file wins. */
const SHARED_VALUE_LEXICON: ProviderLexicon = {
  arguments: { value: 'SAME', doc: PROBE_DOC },
  'skills-dir': { value: '.x/skills/', doc: PROBE_DOC },
  'rules-dir': { value: '.x/rules/', doc: PROBE_DOC },
  'conventions-file': { value: 'SAME', doc: PROBE_DOC },
};

/** `base` is a substring of `base-extended`, so the longer value must be replaced first. */
const NESTED_VALUE_LEXICON: ProviderLexicon = {
  'conventions-file': { value: 'base', doc: PROBE_DOC },
  'rules-dir': { value: 'base-extended', doc: PROBE_DOC },
  'skills-dir': { value: '.x/skills/', doc: PROBE_DOC },
  arguments: { value: '$ARGS', doc: PROBE_DOC },
};

describe('reverseLexicon', () => {
  it('replaces the conventions-file value', () => {
    assert.equal(
      reverseLexicon('Read AGENTS.md', COPILOT_LEXICON),
      'Read {sigil:conventions-file}',
    );
  });

  it('replaces the skills-dir value inside surrounding text', () => {
    assert.equal(
      reverseLexicon('see .github/skills/x', COPILOT_LEXICON),
      'see {sigil:skills-dir}x',
    );
  });

  it('replaces the arguments value', () => {
    assert.equal(
      reverseLexicon('Target: the request you were given', COPILOT_LEXICON),
      'Target: {sigil:arguments}',
    );
  });

  it('round-trips the Copilot bodies through applyLexicon', () => {
    const bodies = ['Read AGENTS.md', 'see .github/skills/x', 'Target: the request you were given'];
    for (const body of bodies) {
      assert.equal(applyLexicon(reverseLexicon(body, COPILOT_LEXICON), COPILOT_LEXICON), body);
    }
  });

  it('resolves a shared value to the first term in LEXICON_TERMS order', () => {
    assert.equal(LEXICON_TERMS.indexOf('conventions-file'), 0);
    assert.equal(reverseLexicon('SAME', SHARED_VALUE_LEXICON), '{sigil:conventions-file}');
  });

  it('replaces a longer value before a shorter value it contains', () => {
    assert.equal(
      reverseLexicon('base-extended then base', NESTED_VALUE_LEXICON),
      '{sigil:rules-dir} then {sigil:conventions-file}',
    );
  });
});
