/**
 * Tests for src/overlays.ts — a consumer's `.sigil/overlays.yaml` narrows where an installed rule
 * applies. A bad entry refuses only its own id; only a file sigil cannot read as a whole fails.
 * (docs/decisions/consumer-overlays-2026-10.md)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { OVERLAYS_FILE, loadOverlays, parseOverlays, withOverlays } from '../dist-cli/overlays';
import { loadResolvedCatalog } from './helpers/catalog';
import { withTempDir } from './helpers/temp-dir';

const RULE = 'typescript/ts-code-quality';

function overlaysOf(entries: Record<string, unknown>) {
  return parseOverlays(JSON.stringify({ rules: entries }));
}

describe('parseOverlays', () => {
  it('should read each rule id with its directory prefixes', () => {
    const { scopes, refused } = overlaysOf({ [RULE]: { scope: ['src', 'packages/api'] } });
    assert.deepEqual([...scopes], [[RULE, ['src', 'packages/api']]]);
    assert.equal(refused.size, 0);
  });

  it('should refuse only the entry whose scope is not a plain relative directory', () => {
    const bad = {
      'a/parent': { scope: ['../x'] },
      'a/absolute': { scope: ['/etc'] },
      'a/drive': { scope: ['C:/x'] },
      'a/glob': { scope: ['src/*'] },
      'a/empty-segment': { scope: ['a//b'] },
      'a/dot': { scope: ['./src'] },
      'a/blank': { scope: [''] },
      'a/no-scope': {},
      'a/empty-list': { scope: [] },
      'a/not-string': { scope: [3] },
    };
    const { scopes, refused } = overlaysOf({ ...bad, [RULE]: { scope: ['src'] } });
    assert.deepEqual([...scopes.keys()], [RULE]);
    assert.deepEqual([...refused.keys()].sort(), Object.keys(bad).sort());
    assert.match(refused.get('a/parent') ?? '', /'\.\.\/x'/);
  });

  it('should fail naming the file when it is not a mapping of rules', () => {
    for (const text of ['rules: [a]', 'just text', 'rules: {a: [', '- a']) {
      assert.throws(() => parseOverlays(text), new RegExp(OVERLAYS_FILE.replace(/[\\.]/g, '.')));
    }
  });

  it('should read an empty file as no overlays', () => {
    assert.equal(parseOverlays('').scopes.size, 0);
  });
});

describe('loadOverlays', () => {
  it('should return no overlays when the project has no overlay file', () => {
    withTempDir(dir => assert.equal(loadOverlays(dir).scopes.size, 0));
  });

  it('should fail naming the file when it exists but cannot be read safely', () => {
    withTempDir(dir => {
      fs.mkdirSync(path.join(dir, OVERLAYS_FILE), { recursive: true });
      assert.throws(() => loadOverlays(dir), /overlays\.yaml/);
    });
  });
});

describe('withOverlays', () => {
  it('should prefix each catalog glob with each scope and leave the input unchanged', async () => {
    const resolved = await loadResolvedCatalog();
    const before = resolved.byId.get(RULE)?.frontmatter.appliesTo;
    const { resolved: overlaid, refused } = withOverlays(
      resolved,
      overlaysOf({ [RULE]: { scope: ['src', 'lib'] } }),
    );
    assert.deepEqual(overlaid.byId.get(RULE)?.frontmatter.appliesTo, [
      'src/**/*.ts',
      'src/**/*.tsx',
      'lib/**/*.ts',
      'lib/**/*.tsx',
    ]);
    assert.equal(
      overlaid.artifacts.find(a => a.id === RULE),
      overlaid.byId.get(RULE),
    );
    assert.deepEqual(resolved.byId.get(RULE)?.frontmatter.appliesTo, before);
    assert.equal(refused.size, 0);
  });

  it('should refuse an id that is not a catalog rule, or a glob it cannot narrow', async () => {
    const resolved = await loadResolvedCatalog();
    const rule = resolved.byId.get(RULE)!;
    const odd = {
      ...rule,
      id: 'x/odd',
      frontmatter: { ...rule.frontmatter, appliesTo: ['src/*.ts'] },
    };
    const catalog = {
      ...resolved,
      artifacts: [...resolved.artifacts, odd],
      byId: new Map([...resolved.byId, [odd.id, odd]]),
    };
    const { refused } = withOverlays(
      catalog,
      overlaysOf({
        'typescript/ts-debugger': { scope: ['src'] },
        'nope/missing': { scope: ['src'] },
        'x/odd': { scope: ['src'] },
        [RULE]: { scope: ['src'] },
      }),
    );
    assert.deepEqual([...refused.keys()].sort(), [
      'nope/missing',
      'typescript/ts-debugger',
      'x/odd',
    ]);
    assert.match(refused.get('typescript/ts-debugger') ?? '', /only rules/);
    assert.match(refused.get('nope/missing') ?? '', /no such catalog rule/);
    assert.match(refused.get('x/odd') ?? '', /src\/\*\.ts/);
  });
});
