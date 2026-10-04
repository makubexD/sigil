/**
 * `sync --apply` rewrites a file through splitFrontmatterBlock / extractOriginalBody, so they must
 * read a file the way the loader (gray-matter) does. A closing fence with text after it on the same
 * line (`---# Heading`, as two catalog skills had) used to be missed: the writer then emitted an
 * empty frontmatter block and pushed the real one into the body. A file with no closing fence now
 * fails loudly instead of being rewritten.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractOriginalBody,
  splitFrontmatterBlock,
} from '../../dist-cli/commands/sync/conformance/frontmatter-patch';
import { parseFrontmatter } from '../../dist-cli/frontmatter-parse';

function split(raw: string) {
  const { frontmatterLines, bodyStart } = splitFrontmatterBlock(raw);
  return { frontmatterLines, body: extractOriginalBody(raw, bodyStart) };
}

describe('splitFrontmatterBlock / extractOriginalBody', () => {
  it('should split a file whose closing fence has its own line', () => {
    assert.deepEqual(split('---\nid: a\nkind: rule\n---\n\n# Title\nBody\n'), {
      frontmatterLines: ['id: a', 'kind: rule'],
      body: '# Title\nBody',
    });
  });

  it('should split a file whose closing fence is followed by text, as gray-matter does', () => {
    const raw = '---\nid: a\nkind: rule\n---# Title\nBody\n';
    assert.deepEqual(split(raw), {
      frontmatterLines: ['id: a', 'kind: rule'],
      body: '# Title\nBody',
    });
    assert.equal(split(raw).body, parseFrontmatter(raw).content.trim());
  });

  it('should refuse a file with no closing fence', () => {
    assert.throws(() => splitFrontmatterBlock('---\nid: a\n# no fence\n'), /closing/);
  });
});
