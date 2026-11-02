/**
 * Tests for src/authoring/header.ts — YAML frontmatter header generation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { headerFor } from '../../dist-cli/authoring/header';
import { parseFrontmatter } from '../../dist-cli/frontmatter-parse';
import { HookSchema } from '../../dist-cli/schema';

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

  it('shared skill header omits the language line', () => {
    const result = headerFor('skill', {
      id: 'shared/foo',
      kind: 'skill',
      title: 'Foo',
      description: 'Foo desc',
      name: 'foo',
    });
    assert.equal(
      result.split('\n').find(l => /^language:/.test(l)),
      undefined,
      'no active language: line when no language is given',
    );
    assert.ok(result.includes('# language:'), 'commented language hint present');
  });

  it('language skill header contains the language line', () => {
    const result = headerFor('skill', {
      id: 'csharp/bar',
      kind: 'skill',
      title: 'Bar',
      description: 'Bar desc',
      name: 'bar',
      language: 'csharp',
    });
    assert.ok(result.includes('language: csharp'), 'language: csharp line present');
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

  it('hook header is a schema-valid hook with a script reading input', () => {
    const result = headerFor('hook', {
      id: 'shared/guard',
      kind: 'hook',
      title: 'Guard',
      description: 'Guard desc',
    });
    const { data } = parseFrontmatter(result);
    const parsed = HookSchema.safeParse(data);
    if (!parsed.success)
      assert.fail(`generated hook rejected: ${JSON.stringify(parsed.error.issues)}`);
    assert.equal(data.event, 'before-tool', 'neutral event emitted');
    assert.equal(data.matcher, '*', 'all-tools matcher emitted');
    assert.equal(data.command, undefined, 'script-only template sets no command');
    const script = String(data.script);
    assert.ok(script.includes('input.files'), 'script reads the neutral input');
    assert.ok(script.includes('process.exitCode = 2'), 'script denies with exit code 2');
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
