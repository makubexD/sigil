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
import type { OverlaidCatalog } from '../dist-cli/overlays';
import { reportOverlayIssues } from '../dist-cli/overlay-report';
import { loadResolvedCatalog } from './helpers/catalog';
import { withTempDir } from './helpers/temp-dir';

const RULE = 'typescript/ts-code-quality';
const SKILL = 'typescript/ts-audit-deps';
const DEP = 'typescript/ts-security';

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
      'a/comma': { scope: ['package.json,src'] },
      'a/backslash': { scope: ['src' + String.fromCharCode(92) + 'api'] },
      'a/control': { scope: ['src' + String.fromCharCode(7) + 'pi'] },
      'a/padded': { scope: [' src'] },
    };
    const { scopes, refused } = overlaysOf({ ...bad, [RULE]: { scope: ['src'] } });
    assert.deepEqual([...scopes.keys()], [RULE]);
    assert.deepEqual([...refused.keys()].sort(), Object.keys(bad).sort());
    assert.match(refused.get('a/parent') ?? '', /'\.\.\/x'/);
  });

  it('should accept a name with accents, composed or decomposed', () => {
    const names = ['café', 'café'];
    assert.deepEqual([...overlaysOf({ [RULE]: { scope: names } }).scopes], [[RULE, names]]);
  });

  it('should accept a trailing slash on a directory', () => {
    assert.deepEqual(
      [...overlaysOf({ [RULE]: { scope: ['src/', 'packages/api/'] } }).scopes],
      [[RULE, ['src', 'packages/api']]],
    );
  });

  it('should fail naming the file when it is not a mapping of rules', () => {
    for (const text of ['rules: [a]', 'just text', 'rules: {a: [', '- a', 'rule: {}']) {
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

  it('should point every skill at the narrowed rule it loads, and drop a refused one', async () => {
    const resolved = await loadResolvedCatalog();
    const narrowedDep = withOverlays(resolved, overlaysOf({ [DEP]: { scope: ['src'] } })).resolved;
    const dep = narrowedDep.byId.get(SKILL)?.resolvedRules?.find(r => r.id === DEP);
    assert.equal(dep, narrowedDep.byId.get(DEP));
    const refusedDep = withOverlays(resolved, overlaysOf({ [DEP]: { scope: ['src/*'] } })).resolved;
    const ids = refusedDep.byId.get(SKILL)?.resolvedRules?.map(r => r.id);
    assert.ok(ids && !ids.includes(DEP) && ids.length > 0);
  });

  it('should ignore an id that is not a catalog rule, and refuse a glob it cannot narrow', async () => {
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
    const { refused, ignored } = withOverlays(
      catalog,
      overlaysOf({
        'typescript/ts-debugger': { scope: ['src'] },
        'nope/missing': { scope: ['src'] },
        'nope/bad': { scope: ['../x'] },
        'x/odd': { scope: ['src'] },
        [RULE]: { scope: ['src'] },
      }),
    );
    assert.deepEqual([...refused.keys()], ['x/odd']);
    assert.deepEqual([...ignored.keys()].sort(), [
      'nope/bad',
      'nope/missing',
      'typescript/ts-debugger',
    ]);
    assert.match(ignored.get('typescript/ts-debugger') ?? '', /only rules/);
    assert.match(ignored.get('nope/missing') ?? '', /no such catalog rule/);
    assert.match(refused.get('x/odd') ?? '', /src\/\*\.ts/);
  });
});

describe('reportOverlayIssues', () => {
  /** An overlaid catalog with only the issue maps set, which is all the report reads. */
  const overlaid = (ignored: [string, string][], refused: [string, string][]): OverlaidCatalog =>
    ({ resolved: undefined, ignored: new Map(ignored), refused: new Map(refused) }) as never;

  /** Every warning `reportOverlayIssues` prints for `catalogs`. */
  const warnings = (catalogs: OverlaidCatalog[]): string[] => {
    const lines: string[] = [];
    reportOverlayIssues(catalogs, line => lines.push(line));
    return lines;
  };

  it('reports an ignored entry only when every catalog ignored it', () => {
    const lines = warnings([
      overlaid(
        [
          ['team/only', 'not in the catalog'],
          ['gone/rule', 'not in the catalog'],
        ],
        [],
      ),
      overlaid([['gone/rule', 'not in the catalog']], []),
    ]);
    assert.deepEqual(lines, [`${OVERLAYS_FILE}: gone/rule: not in the catalog; ignored`]);
  });

  it('reports a refused entry once when several catalogs refused it', () => {
    const lines = warnings([overlaid([], [['a/rule', 'bad']]), overlaid([], [['a/rule', 'bad']])]);
    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /a\/rule: bad; this rule is not installed or updated/);
  });

  it('reports nothing for no catalogs', () => {
    assert.deepEqual(warnings([]), []);
  });
});
