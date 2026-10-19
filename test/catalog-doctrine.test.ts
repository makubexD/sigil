/**
 * Catalog doctrine stays consistent across every artifact an agent can receive. Each doctrine has
 * one home (`shared/clean-code` or a template); a retired wording must not survive anywhere else,
 * advice that is safe only with a qualifier carries the qualifier in the same text, and a family
 * that must carry a doctrine has it in every member's delivered text.
 *
 * Texts are read resolved (templates composed, `extends` bases prepended) plus each skill's
 * reference files, so the check sees what ships, not only the source body. Whitespace is collapsed
 * first so wrapped prose still matches. Background: docs/audits/2026-10-14.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalogStandard } from '../dist-cli/catalog-standard';
import type { ResolvedArtifact } from '../dist-cli/types';
import { CATALOG_DIR, loadResolvedCatalog } from './helpers/catalog';

interface Retired {
  readonly pattern: RegExp;
  readonly why: string;
}

interface Implies {
  readonly when: RegExp;
  readonly then: RegExp;
  readonly why: string;
}

interface Canonical {
  readonly family: string;
  readonly phrase: string;
}

const RETIRED: readonly Retired[] = [
  {
    pattern: /duplication is (a bug|worse than)/i,
    why: 'one duplication doctrine lives in shared/clean-code: a wrong abstraction costs more than duplication',
  },
  {
    pattern: /add the smallest correct version|\(a logger/i,
    why: 'licenses infrastructure the task did not ask for; say what is missing instead',
  },
  {
    pattern: /either log with context or re-?(throw|raise)/i,
    why: 'log-and-continue is allowed only at a top-level boundary; reviewers flag it elsewhere',
  },
  {
    pattern:
      /max \d+ (lines|parameters|props)|body (>|exceeds) ?\d+ lines|split into smaller units before proceeding|single-purpose functions/i,
    why: 'prose that says when to split a function makes agents split more (test/evals/code-quality, rounds 3-4)',
  },
  {
    pattern: /\bsafeLoad\b|yaml\.load` without `\{ ?schema/,
    why: 'js-yaml 4 removed safeLoad, and its yaml.load no longer constructs JavaScript types',
  },
  {
    pattern: /\.WhenBoth\(/,
    why: 'not a .NET API; await Task.WhenAll, then each task',
  },
  {
    pattern: /rethrow bare `?throw/i,
    why: 'JavaScript has no bare throw; a catch that only rethrows is removed or wraps with cause',
  },
  {
    pattern: /without a `@ts-expect-error/,
    why: 'any raises no compile error, so @ts-expect-error over it is itself an error (TS2578)',
  },
  {
    pattern: /\{ params \}: \{ params: \{/,
    why: 'Next.js 15+ passes params as a Promise; await it',
  },
  {
    pattern: /rejection cancel all/i,
    why: 'Promise.all rejects on the first failure but cancels nothing; the rest keep running',
  },
  {
    pattern: /\.pipe\((?:(?!takeUntil)[^;])*\)\.subscribe\(/,
    why: 'a subscription with no teardown outlives its component',
  },
];

const PRIVATE_RANGES = /private IP ranges?/i;

/** How far from an IMPLIES `when` match its `then` must appear (characters, either side). */
const NEAR = 300;

/**
 * Advice that matches `when` is safe only when `then` matches near it: within NEAR characters on
 * either side, so a qualifier elsewhere in the same artifact does not count.
 */
const IMPLIES: readonly Implies[] = [
  {
    when: /[Ss]tartsWith\([^)]*[Rr]oot/,
    then: /DirectorySeparatorChar|path\.sep/,
    why: 'a root-prefix check without a trailing separator lets a sibling directory (/app/data-evil) through',
  },
  {
    when: PRIVATE_RANGES,
    then: /169\.254/,
    why: 'a private-range block list without link-local leaves the cloud metadata endpoint reachable',
  },
  {
    when: PRIVATE_RANGES,
    then: /resolved address/i,
    why: 'checking the hostname instead of the address it resolves to lets a DNS name point anywhere',
  },
  {
    when: /Promise\.all\(\s*\w+\.map\(|create_task\([^)]*\)\) for \w+ in \w+|mergeMap`? \|[^|]*fan-out/,
    then: /(cap|limit|bound) (the )?concurrency|concurrency (cap|limit)|Semaphore\(|mergeMap\([^)]*, ?\d/,
    why: 'one task per item of an unbounded list exhausts sockets, memory and rate limits',
  },
  {
    when: /httpx\.AsyncClient\(\)/,
    then: /reuse one client|one client per/i,
    why: 'a client per call throws away the connection pool',
  },
  {
    when: /Sequential `?await`?[^.]{0,80}(Task\.WhenAll|TaskGroup)/,
    then: /DbContext|database session/,
    why: 'a DbContext or database session does not support concurrent operations',
  },
];

const TOP_LEVEL_CATCH = 'log and continue only at a top-level boundary';

const CANONICAL: readonly Canonical[] = [
  { family: 'code-quality', phrase: 'a wrong abstraction costs more than duplication' },
  { family: 'code-quality', phrase: TOP_LEVEL_CATCH },
  { family: 'code-quality', phrase: 'a boolean reads as a predicate' },
  { family: 'code-quality', phrase: 'a quantity carries its unit' },
  { family: 'code-quality', phrase: 'mark it with a `shortcut:` comment' },
  { family: 'code-reviewer', phrase: TOP_LEVEL_CATCH },
];

function flatten(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function deliveredTexts(artifact: ResolvedArtifact): string[] {
  const body = artifact.resolvedBody ?? artifact.body;
  return [body, ...(artifact.references ?? []).map(ref => ref.content)].map(flatten);
}

function unqualified(text: string, rule: Implies): boolean {
  const when = new RegExp(rule.when.source, rule.when.flags.replace('g', '') + 'g');
  for (const match of text.matchAll(when)) {
    const near = text.slice(Math.max(0, match.index - NEAR), match.index + match[0].length + NEAR);
    if (!rule.then.test(near)) return true;
  }
  return false;
}

describe('catalog doctrine', () => {
  it('should not ship a retired wording in any artifact', async () => {
    const catalog = await loadResolvedCatalog();
    const hits = catalog.artifacts.flatMap(artifact =>
      RETIRED.filter(r => deliveredTexts(artifact).some(text => r.pattern.test(text))).map(
        r => `${artifact.id}: ${r.pattern} (${r.why})`,
      ),
    );
    assert.deepEqual(hits, []);
  });

  it('should pair each conditional advice with what makes it safe', async () => {
    const catalog = await loadResolvedCatalog();
    const hits = catalog.artifacts.flatMap(artifact =>
      IMPLIES.filter(r => deliveredTexts(artifact).some(text => unqualified(text, r))).map(
        r => `${artifact.id}: ${r.when} without ${r.then} (${r.why})`,
      ),
    );
    assert.deepEqual(hits, []);
  });

  it('should carry each canonical doctrine in every member of its family', async () => {
    const catalog = await loadResolvedCatalog();
    const standard = loadCatalogStandard(CATALOG_DIR);
    assert.ok(standard, 'catalog/standard.yaml loads');
    const missing = CANONICAL.flatMap(({ family, phrase }) => {
      const members = standard.families.find(f => f.id === family)?.members ?? [];
      assert.ok(members.length > 0, `family ${family} has members`);
      return members
        .filter(id => {
          const artifact = catalog.byId.get(id);
          assert.ok(artifact, `${id} is in the catalog`);
          return !deliveredTexts(artifact).some(text => text.toLowerCase().includes(phrase));
        })
        .map(id => `${id}: missing "${phrase}"`);
    });
    assert.deepEqual(missing, []);
  });
});
