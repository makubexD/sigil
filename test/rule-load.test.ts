/**
 * scripts/rule-load.cjs measures how many rule bytes an agent receives with one source file per
 * language. It must count what `add` actually installs: a base rule inlined into a language rule
 * through `extends` (shared/git, shared/clean-code) is delivered once, inside that rule.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { CATALOG_DIR } from './helpers/catalog';

interface RuleBytes {
  id: string;
  bytes: number;
}
interface LanguageLoad {
  sample: string;
  rules: RuleBytes[];
  bytes: number;
}
interface RuleLoadReport {
  languages: Record<string, LanguageLoad>;
}

const { ruleLoad } = require(path.join(CATALOG_DIR, '..', 'scripts', 'rule-load.cjs')) as {
  ruleLoad: (catalogDir: string) => Promise<RuleLoadReport>;
};

describe('scripts/rule-load.cjs', () => {
  it('counts an inlined base rule once, inside the language rule that extends it', async () => {
    const ts = (await ruleLoad(CATALOG_DIR)).languages.typescript;
    assert.ok(ts, 'typescript is measured');
    const ids = ts.rules.map(r => r.id);
    assert.ok(ids.includes('typescript/ts-git'), 'ts-git applies to .ts files');
    assert.ok(ids.includes('typescript/ts-code-quality'));
    assert.ok(!ids.includes('shared/git'), 'shared/git is inlined into ts-git');
    assert.ok(
      !ids.includes('shared/clean-code'),
      'shared/clean-code is inlined into ts-code-quality',
    );
  });

  it('reports a total equal to the sum of its rules, for every language', async () => {
    const { languages } = await ruleLoad(CATALOG_DIR);
    assert.deepEqual(Object.keys(languages).sort(), [
      'angular',
      'csharp',
      'python',
      'react',
      'typescript',
    ]);
    for (const [lang, load] of Object.entries(languages)) {
      const sum = load.rules.reduce((total, r) => total + r.bytes, 0);
      assert.equal(load.bytes, sum, lang);
      assert.ok(load.bytes > 0, lang);
    }
  });
});
