/**
 * gray-matter caches parse results by content and returns the cached `data` object itself, so a
 * caller that edits that object (move, patch, edit, sync --apply) changed what every later parse of
 * the same text returned in the same process. Every src/ parse goes through parseFrontmatter, which
 * always returns a fresh object.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, parseYamlFrontmatter } from '../dist-cli/frontmatter-parse';
import { writeArtifactFrontmatter } from '../dist-cli/authoring/frontmatter';
import { withTempDirAsync } from './helpers/temp-dir';
import { loadCatalog } from '../dist-cli/load';

const SOURCE = '---\nid: shared/probe\nkind: rule\n---\n\nbody\n';

describe('parseFrontmatter', () => {
  it('should return a fresh object for identical text', () => {
    const first = parseFrontmatter(SOURCE);
    first.data.id = 'mutated/id';
    assert.equal(parseFrontmatter(SOURCE).data.id, 'shared/probe');
  });

  it('should load the original id after another file with the same text was edited', async () => {
    await withTempDirAsync(async dir => {
      const edited = path.join(dir, 'edited.rule.md');
      fs.writeFileSync(edited, SOURCE);
      writeArtifactFrontmatter(edited, { id: 'shared/renamed' });
      const catalogDir = path.join(dir, 'catalog');
      fs.mkdirSync(path.join(catalogDir, 'shared', 'rules'), { recursive: true });
      fs.writeFileSync(path.join(catalogDir, 'shared', 'rules', 'probe.rule.md'), SOURCE);
      const catalog = await loadCatalog(catalogDir);
      assert.deepEqual(
        catalog.artifacts.map(a => a.id),
        ['shared/probe'],
      );
    });
  });
});

describe('parseYamlFrontmatter', () => {
  it('should parse a quoted scalar the tolerant parser corrupts', () => {
    const fm = parseYamlFrontmatter('description: "He said \\"hi\\": ok"');
    assert.equal(fm?.description, 'He said "hi": ok');
  });

  it('should parse a folded block scalar', () => {
    const fm = parseYamlFrontmatter('description: >-\n  line one\n  line two');
    assert.equal(fm?.description, 'line one line two');
  });

  it('should keep a flow sequence as a string array', () => {
    const fm = parseYamlFrontmatter('tools: ["read", "search"]');
    assert.deepEqual(fm?.tools, ['read', 'search']);
  });

  it('should return undefined for invalid YAML', () => {
    assert.equal(parseYamlFrontmatter('description: Fix: the bug'), undefined);
  });

  it('should return undefined when the document is not a mapping', () => {
    assert.equal(parseYamlFrontmatter('- a\n- b'), undefined);
    assert.equal(parseYamlFrontmatter('just a string'), undefined);
  });

  it('should omit forbidden keys without touching Object.prototype', () => {
    const fm = parseYamlFrontmatter('id: shared/ok\n__proto__: x\nconstructor: y\nprototype: z');
    assert.deepEqual(fm, { id: 'shared/ok' });
    assert.equal(Object.getPrototypeOf(fm), Object.prototype);
    assert.ok(!Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'));
  });
});
