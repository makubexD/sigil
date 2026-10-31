/**
 * Tests for src/authoring/import/copilot-fields.ts — pure Copilot frontmatter normalisation.
 *
 * Every note and refusal string is asserted character-for-character against the plan.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  copilotSlug,
  splitGlobList,
  normalizeRuleFields,
  normalizeAgentFields,
  normalizeSkillFields,
} from '../../dist-cli/authoring/import/copilot-fields';

const NO_APPLY_TO_NOTE = 'no applyTo in source; imported as **/*, which applies to every file';
const WILDCARD_TOOLS_NOTE = "tools ['*'] removed: an absent list already means all tools";
const EMPTY_TOOLS_REFUSAL = 'tools is empty, and an absent list would grant every tool';
const NAME_NOTE =
  "name 'Code Reviewer' not kept; the catalog name is 'code-reviewer' (from the file name)";

describe('copilotSlug', () => {
  const cases: Array<[string, string, string | undefined, string]> = [
    ['typescript namespace prefix', 'typescript-ts-async', 'typescript', 'ts-async'],
    ['shared namespace prefix', 'shared-explain-diff', 'shared', 'explain-diff'],
    ['lowercases and normalises separators', 'React_Guidelines', undefined, 'react-guidelines'],
    ['nothing left after normalising', '___', undefined, ''],
  ];

  for (const [name, stem, namespace, expected] of cases) {
    it(name, () => {
      assert.equal(copilotSlug(stem, namespace), expected);
    });
  }
});

describe('splitGlobList', () => {
  it('keeps commas inside brace groups', () => {
    assert.deepEqual(splitGlobList('**/*.{ts,tsx},src/**'), ['**/*.{ts,tsx}', 'src/**']);
  });

  it('trims items and drops empties', () => {
    assert.deepEqual(splitGlobList('a , b,'), ['a', 'b']);
  });
});

describe('normalizeRuleFields', () => {
  it('turns applyTo into paths of both globs', () => {
    const result = normalizeRuleFields({ applyTo: '**/*.ts,**/*.tsx' });
    assert.deepEqual(result.frontmatter.paths, ['**/*.ts', '**/*.tsx']);
    assert.equal('applyTo' in result.frontmatter, false);
    assert.deepEqual(result.notes, []);
  });

  it('notes a missing applyTo and leaves paths absent', () => {
    const result = normalizeRuleFields({ description: 'Rule' });
    assert.equal('paths' in result.frontmatter, false);
    assert.deepEqual(result.notes, [NO_APPLY_TO_NOTE]);
  });

  for (const applyTo of ['', null, []]) {
    it(`treats applyTo ${JSON.stringify(applyTo)} as missing`, () => {
      const result = normalizeRuleFields({ applyTo });
      assert.equal('paths' in result.frontmatter, false);
      assert.equal('applyTo' in result.frontmatter, false);
      assert.deepEqual(result.notes, [NO_APPLY_TO_NOTE]);
    });
  }

  it('collapses whitespace in description', () => {
    const result = normalizeRuleFields({
      description: 'line one\n  line   two',
      applyTo: '**/*.ts',
    });
    assert.equal(result.frontmatter.description, 'line one line two');
  });
});

describe('normalizeAgentFields', () => {
  it('sets name from the slug and notes the source name', () => {
    const result = normalizeAgentFields({ name: 'Code Reviewer' }, 'code-reviewer');
    assert.equal(result.frontmatter.name, 'code-reviewer');
    assert.deepEqual(result.notes, [NAME_NOTE]);
  });

  const emptyTools: Array<[string, unknown]> = [
    ['empty array', []],
    ['empty string', ''],
    ['null', null],
  ];

  for (const [name, tools] of emptyTools) {
    it(`refuses ${name} tools`, () => {
      const result = normalizeAgentFields({ tools }, 'a');
      assert.equal(result.refused, EMPTY_TOOLS_REFUSAL);
    });
  }

  it('removes wildcard tools and notes why', () => {
    const result = normalizeAgentFields({ tools: ['*'] }, 'a');
    assert.equal('tools' in result.frontmatter, false);
    assert.deepEqual(result.notes, [WILDCARD_TOOLS_NOTE]);
    assert.equal(result.refused, undefined);
  });

  it('leaves an absent tools key absent', () => {
    const result = normalizeAgentFields({}, 'a');
    assert.equal('tools' in result.frontmatter, false);
    assert.deepEqual(result.notes, []);
    assert.equal(result.refused, undefined);
  });
});

describe('normalizeSkillFields', () => {
  it('splits allowed-tools into an array', () => {
    const result = normalizeSkillFields({ 'allowed-tools': 'Read Write Bash' }, 'a');
    assert.deepEqual(result.frontmatter['allowed-tools'], ['Read', 'Write', 'Bash']);
  });

  it('removes a name equal to the slug without a note', () => {
    const result = normalizeSkillFields({ name: 'my-skill' }, 'my-skill');
    assert.equal('name' in result.frontmatter, false);
    assert.deepEqual(result.notes, []);
  });
});
