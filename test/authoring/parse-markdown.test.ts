/**
 * Tests for src/authoring/import/parse-markdown.ts's prototype-pollution guard (round-6 audit,
 * 2026-08-25). `parseMarkdown` is the tolerant frontmatter parser behind `sigil import` — the one
 * real path where an externally-authored, untrusted file's frontmatter keys reach a plain object
 * via bracket assignment. Found by a dogfooded `ts-security-auditor` run.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdown } from '../../dist-cli/authoring/import/parse-markdown';
import { withTempDir } from '../helpers/temp-dir';

describe('parseMarkdown — prototype-pollution guard', () => {
  it('drops a __proto__ frontmatter key instead of assigning it', () => {
    withTempDir(dir => {
      const filePath = path.join(dir, 'evil.md');
      fs.writeFileSync(
        filePath,
        '---\nid: shared/evil\n__proto__:\n  - polluted\ntitle: Evil\n---\n\nBody text.\n',
        'utf-8',
      );
      const { frontmatter } = parseMarkdown(filePath);
      assert.ok(
        !Object.prototype.hasOwnProperty.call(frontmatter, '__proto__'),
        '__proto__ must not become an own property of the parsed frontmatter',
      );
      assert.equal(frontmatter.id, 'shared/evil', 'other keys still parse normally');
      assert.equal(
        Object.getPrototypeOf(frontmatter),
        Object.prototype,
        "the parsed object's own prototype must be untouched",
      );
    });
  });

  it('drops constructor and prototype frontmatter keys too', () => {
    withTempDir(dir => {
      const filePath = path.join(dir, 'evil2.md');
      fs.writeFileSync(
        filePath,
        '---\nid: shared/evil2\nconstructor: hijacked\nprototype: hijacked\n---\n\nBody.\n',
        'utf-8',
      );
      const { frontmatter } = parseMarkdown(filePath);
      assert.equal(typeof frontmatter.constructor, 'function', 'constructor keeps its real value');
      assert.ok(!('prototype' in frontmatter) || frontmatter.prototype === undefined);
    });
  });
});
