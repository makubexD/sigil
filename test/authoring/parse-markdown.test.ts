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

/** Writes `content` to a temp file named `name` in `dir` and parses it. */
function parseSource(
  dir: string,
  name: string,
  content: string,
  opts?: { yamlFirst?: boolean },
): { frontmatter: Record<string, unknown>; body: string } {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return parseMarkdown(filePath, opts);
}

describe('parseMarkdown — yamlFirst', () => {
  it('should parse a quoted scalar the tolerant parser corrupts', () => {
    withTempDir(dir => {
      const { frontmatter } = parseSource(
        dir,
        'quoted.md',
        '---\ndescription: "He said \\"hi\\": ok"\n---\n\nBody.\n',
        { yamlFirst: true },
      );
      assert.equal(frontmatter.description, 'He said "hi": ok');
    });
  });

  it('should parse a folded block scalar', () => {
    withTempDir(dir => {
      const { frontmatter } = parseSource(
        dir,
        'folded.md',
        '---\ndescription: >-\n  line one\n  line two\n---\n\nBody.\n',
        { yamlFirst: true },
      );
      assert.equal(frontmatter.description, 'line one line two');
    });
  });

  it('should keep a flow sequence as a string array', () => {
    withTempDir(dir => {
      const { frontmatter } = parseSource(
        dir,
        'list.md',
        '---\ntools: ["read", "search"]\n---\n\nBody.\n',
        { yamlFirst: true },
      );
      assert.deepEqual(frontmatter.tools, ['read', 'search']);
    });
  });

  it('should fall back to the tolerant parser on invalid YAML', () => {
    withTempDir(dir => {
      const { frontmatter } = parseSource(
        dir,
        'invalid.md',
        '---\ndescription: Fix: the bug\n---\n\nBody.\n',
        { yamlFirst: true },
      );
      assert.equal(frontmatter.description, 'Fix: the bug');
    });
  });

  it('should fall back to the tolerant parser when the frontmatter is a YAML list', () => {
    withTempDir(dir => {
      const { frontmatter } = parseSource(dir, 'yaml-list.md', '---\n- a\n- b\n---\n\nBody.\n', {
        yamlFirst: true,
      });
      assert.deepEqual(frontmatter, {});
    });
  });

  it('should drop __proto__ without touching Object.prototype', () => {
    withTempDir(dir => {
      const { frontmatter } = parseSource(
        dir,
        'proto.md',
        '---\n__proto__:\n  - polluted\nid: shared/evil\n---\n\nBody.\n',
        { yamlFirst: true },
      );
      assert.ok(!Object.prototype.hasOwnProperty.call(frontmatter, '__proto__'));
      assert.equal(Object.getPrototypeOf(frontmatter), Object.prototype);
      assert.ok(!Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'));
      assert.equal(frontmatter.id, 'shared/evil');
    });
  });

  it('should not execute a ---js block', () => {
    withTempDir(dir => {
      Reflect.deleteProperty(globalThis, 'SIGIL_PWNED');
      const { body } = parseSource(
        dir,
        'js.md',
        '---js\nglobalThis.SIGIL_PWNED = true\n---\n\nBody.\n',
        { yamlFirst: true },
      );
      assert.equal(Reflect.get(globalThis, 'SIGIL_PWNED'), undefined);
      assert.equal(body.trim(), 'Body.');
    });
  });

  it("should keep today's tolerant value when opts are omitted", () => {
    withTempDir(dir => {
      const { frontmatter } = parseSource(
        dir,
        'default.md',
        '---\ndescription: "He said \\"hi\\": ok"\n---\n\nBody.\n',
      );
      assert.equal(frontmatter.description, 'He said \\"hi\\": ok');
    });
  });
});

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
