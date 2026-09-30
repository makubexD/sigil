/**
 * Tests for src/authoring/frontmatter.ts — serializeYamlEntry + writeArtifactFrontmatter.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { serializeYamlEntry, writeArtifactFrontmatter } from '../../dist-cli/authoring/frontmatter';

// ─── serializeYamlEntry ───────────────────────────────────────────────────────

describe('serializeYamlEntry', () => {
  it('plain string with no special chars', () => {
    assert.equal(serializeYamlEntry('title', 'Hello World'), 'title: Hello World');
  });

  it('string containing colon is double-quoted', () => {
    const result = serializeYamlEntry('description', 'Fix: the bug');
    assert.ok(result.includes('"'), `string with colon must be double-quoted: ${result}`);
    assert.ok(result.startsWith('description:'), `key still present: ${result}`);
  });

  it('empty array emits flow empty array', () => {
    assert.equal(serializeYamlEntry('tags', []), 'tags: []');
  });

  it('non-empty string array emits block sequence', () => {
    const result = serializeYamlEntry('tags', ['foo', 'bar']);
    assert.ok(result.includes('  - foo'), `block sequence item foo: ${result}`);
    assert.ok(result.includes('  - bar'), `block sequence item bar: ${result}`);
    assert.ok(result.startsWith('tags:'), `key prefix: ${result}`);
  });

  it('array of objects emits block sequence of mappings', () => {
    const result = serializeYamlEntry('hooks', [{ event: 'PreToolUse', command: 'echo hi' }]);
    assert.ok(result.includes('  - event: PreToolUse'), `first entry: ${result}`);
    assert.ok(result.includes('    command: echo hi'), `subsequent entry: ${result}`);
  });

  it('object emits block mapping', () => {
    const result = serializeYamlEntry('uses', { rules: 'shared/clean-code' });
    assert.ok(result.startsWith('uses:'), `key prefix: ${result}`);
    assert.ok(result.includes('  rules: shared/clean-code'), `nested entry: ${result}`);
  });

  it('boolean value serialised as plain scalar', () => {
    assert.equal(serializeYamlEntry('active', true), 'active: true');
    assert.equal(serializeYamlEntry('active', false), 'active: false');
  });

  it('number value serialised as plain scalar', () => {
    assert.equal(serializeYamlEntry('maxTurns', 42), 'maxTurns: 42');
  });

  it('string starting with # is double-quoted', () => {
    const result = serializeYamlEntry('tag', '#important');
    assert.ok(result.includes('"'), `string starting with # must be quoted: ${result}`);
  });

  it('glob pattern starting with * is double-quoted (YAML alias prevention)', () => {
    const result = serializeYamlEntry('appliesTo', ['**/*.cs']);
    assert.ok(result.includes('"**/*.cs"'), `glob must be double-quoted: ${result}`);
  });

  it('argument-hint starting with [ is double-quoted (YAML flow-sequence prevention)', () => {
    const result = serializeYamlEntry('argumentHint', '[file-or-class] (optional)');
    assert.ok(result.includes('"'), `[... value must be double-quoted: ${result}`);
    assert.ok(!result.includes(': [file'), 'must not emit unquoted [ value');
  });

  it('value starting with { is double-quoted', () => {
    const result = serializeYamlEntry('key', '{value}');
    assert.ok(result.includes('"'), `{... value must be double-quoted: ${result}`);
  });
});

// ─── writeArtifactFrontmatter ─────────────────────────────────────────────────

describe('writeArtifactFrontmatter', () => {
  function makeTempFile(content: string): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-fm-'));
    const p = path.join(tmpDir, 'artifact.rule.md');
    fs.writeFileSync(p, content, 'utf-8');
    return p;
  }

  function cleanTempFile(p: string): void {
    try {
      fs.rmSync(path.dirname(p), { recursive: true });
    } catch {
      /* best-effort */
    }
  }

  const MINIMAL_MD = `---
id: shared/clean-code
kind: rule
title: Clean Code
description: A clean code rule.
---

Body text here.
`;

  it('updates an existing scalar field', () => {
    const p = makeTempFile(MINIMAL_MD);
    try {
      writeArtifactFrontmatter(p, { title: 'Updated Title' });
      const raw = fs.readFileSync(p, 'utf-8');
      assert.ok(raw.includes('title: Updated Title'), `title updated in file: ${raw}`);
      assert.ok(raw.includes('kind: rule'), 'other fields preserved');
      assert.ok(raw.includes('Body text here.'), 'body preserved');
    } finally {
      cleanTempFile(p);
    }
  });

  it('adds a new field that was not in the original frontmatter', () => {
    const p = makeTempFile(MINIMAL_MD);
    try {
      writeArtifactFrontmatter(p, { tags: ['new-tag'] });
      const raw = fs.readFileSync(p, 'utf-8');
      assert.ok(raw.includes('tags:'), 'new field present');
      assert.ok(raw.includes('  - new-tag'), 'tag value present');
    } finally {
      cleanTempFile(p);
    }
  });

  it('deletes a field when patched with undefined', () => {
    const p = makeTempFile(MINIMAL_MD);
    try {
      writeArtifactFrontmatter(p, { description: undefined });
      const raw = fs.readFileSync(p, 'utf-8');
      // Primary assertion: description key is gone
      assert.ok(!raw.includes('description:'), `description field must be removed; raw: ${raw}`);
      // Secondary: title key still present (value may be quoted; check the key only)
      assert.ok(
        raw.includes('title:'),
        `title key must remain after deleting description; raw: ${raw}`,
      );
      // The body must also survive
      assert.ok(raw.includes('Body text here.'), 'body preserved after deletion');
    } finally {
      cleanTempFile(p);
    }
  });

  it('preserves body content after rewrite', () => {
    const md = `---\nid: shared/x\nkind: rule\ntitle: X\ndescription: X\n---\n\nSome **markdown** body\n- list item\n  - nested\n`;
    const p = makeTempFile(md);
    try {
      writeArtifactFrontmatter(p, { title: 'Y' });
      const raw = fs.readFileSync(p, 'utf-8');
      // Check all body lines are preserved (don't assert exact leading-newline format
      // since gray-matter may strip the leading newline from parsed.content).
      assert.ok(raw.includes('Some **markdown** body'), 'body paragraph preserved');
      assert.ok(raw.includes('- list item'), 'body list item preserved');
      assert.ok(raw.includes('  - nested'), 'body nested item preserved');
      // The frontmatter must have been updated
      assert.ok(raw.includes('title: Y'), 'frontmatter title updated');
    } finally {
      cleanTempFile(p);
    }
  });

  it('double-quotes descriptions that contain colons', () => {
    const p = makeTempFile(MINIMAL_MD);
    try {
      writeArtifactFrontmatter(p, { description: 'Fix: null pointer' });
      const raw = fs.readFileSync(p, 'utf-8');
      assert.ok(raw.includes('"Fix: null pointer"'), `colon in description must be quoted: ${raw}`);
    } finally {
      cleanTempFile(p);
    }
  });
});
