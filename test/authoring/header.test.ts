/**
 * Tests for src/authoring/header.ts — YAML frontmatter header generation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { headerFor } from '../../dist-cli/authoring/header';

describe('E4 — headerFor', () => {
  it('skill header contains required fields', () => {
    const result = headerFor('skill', {
      id: 'csharp/foo',
      kind: 'skill',
      title: 'Foo',
      description: 'Foo desc',
      name: 'foo',
      language: 'csharp',
    });
    assert.ok(result.includes('id: csharp/foo'), 'id field present');
    assert.ok(result.includes('kind: skill'), 'kind field present');
    assert.ok(result.includes('name: foo'), 'name field present');
    assert.ok(result.includes('language: csharp'), 'language field present');
  });

  it('restricted platforms emitted active', () => {
    const result = headerFor('rule', {
      id: 'shared/bar',
      kind: 'rule',
      title: 'Bar',
      description: 'Bar desc',
      platforms: ['claude'],
    });
    // Active platforms: block should be present (not commented out)
    assert.ok(result.includes('platforms:'), 'platforms: key present');
    assert.ok(result.includes('  - claude'), '  - claude entry present');
  });

  it('unrestricted platforms emitted as comment only', () => {
    const result = headerFor('agent', {
      id: 'shared/baz',
      kind: 'agent',
      title: 'Baz',
      description: 'Baz desc',
      name: 'baz',
    });
    // Comment-only platforms hint should be present
    assert.ok(result.includes('# platforms:'), '# platforms: comment present');
    // No active (non-comment) platforms: line should exist
    const activeplatformsLine = result.split('\n').find(l => /^platforms:/.test(l));
    assert.equal(activeplatformsLine, undefined, 'no active platforms: line when not restricted');
  });
});
