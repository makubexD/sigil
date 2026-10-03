/**
 * Catalog layout is read relative to the catalog root: `shared/<kindDir>/…` or
 * `languages/<lang>/<kindDir>/…`. Folders above the root never count, so a catalog kept under a
 * folder that happens to be named `shared` or `languages/<x>` is read the same as anywhere else.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { locateSource, splitId } from '../dist-cli/catalog-layout';
import { loadCatalog } from '../dist-cli/load';
import { checkSourceArtifact } from '../dist-cli/authoring/check-source';
import { getAllTargets } from '../dist-cli/targets/index';
import { withTempDirAsync } from './helpers/temp-dir';

const ROOT = path.join(path.sep, 'work', 'catalog');
const at = (...segments: string[]) => path.join(ROOT, ...segments);

describe('locateSource', () => {
  it('should read a shared artifact', () => {
    assert.deepEqual(locateSource(ROOT, at('shared', 'rules', 'git.rule.md')), {
      namespace: 'shared',
      kindDir: 'rules',
      kind: 'rule',
    });
  });

  it('should read a language artifact', () => {
    assert.deepEqual(locateSource(ROOT, at('languages', 'csharp', 'skills', 'x', 'SKILL.md')), {
      namespace: 'csharp',
      kindDir: 'skills',
      kind: 'skill',
    });
  });

  it('should report no namespace for a file outside both', () => {
    assert.deepEqual(locateSource(ROOT, at('misc', 'x.rule.md')), { kind: 'rule' });
  });

  it('should ignore folders above the catalog root', () => {
    const root = path.join(path.sep, 'languages', 'notes', 'shared', 'catalog');
    const file = path.join(root, 'shared', 'rules', 'git.rule.md');
    assert.equal(locateSource(root, file).namespace, 'shared');
  });
});

describe('splitId', () => {
  it('should split a two-part id', () => {
    assert.deepEqual(splitId('csharp/cs-release', 'skill'), {
      prefix: 'csharp',
      name: 'cs-release',
    });
  });

  it('should split a template id around its templates segment', () => {
    assert.deepEqual(splitId('shared/templates/mcp-note', 'template'), {
      prefix: 'shared',
      name: 'mcp-note',
    });
  });

  it('should reject ids of the wrong shape', () => {
    assert.equal(splitId('shared/templates/x', 'skill'), undefined);
    assert.equal(splitId('shared/x', 'template'), undefined);
    assert.equal(splitId('x', 'rule'), undefined);
  });
});

describe('sigil check — catalog kept under a folder named like a namespace', () => {
  it('should not read the parent folders as the namespace', async () => {
    await withTempDirAsync(async tmp => {
      const root = path.join(tmp, 'languages', 'notes', 'catalog');
      const file = path.join(root, 'shared', 'rules', 'probe.rule.md');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        '---\nid: shared/probe\nkind: rule\ntitle: Probe\ndescription: A probe rule.\n---\n\n- **Probe.** x\n',
      );
      const catalog = await loadCatalog(root);
      const artifact = catalog.byId.get('shared/probe')!;
      const problems = checkSourceArtifact(artifact, catalog, getAllTargets()).map(v => v.problem);
      assert.deepEqual(
        problems.filter(p => /prefix/.test(p)),
        [],
      );
    });
  });
});
