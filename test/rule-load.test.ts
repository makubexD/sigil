/**
 * scripts/rule-load.cjs measures how many rule bytes an agent receives with one source file per
 * language. It must count what `add` actually installs: a base rule inlined into a language rule
 * through `extends` (shared/git, shared/clean-code) is delivered once, inside that rule.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

interface Baseline {
  bytes: number;
  reason: string;
}

const { ruleLoad, BASELINE_PATH, SLACK_BYTES } = require(
  path.join(CATALOG_DIR, '..', 'scripts', 'rule-load.cjs'),
) as {
  ruleLoad: (catalogDir: string) => Promise<RuleLoadReport>;
  BASELINE_PATH: string;
  SLACK_BYTES: number;
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

  // Always-loaded rule bytes are paid on every session (docs/audits/2026-10-16, A3). Growth needs a
  // recorded reason; a drop must lower the baseline so the room cannot be refilled silently.
  it('keeps every language within its recorded rule-load baseline', async () => {
    const { languages } = await ruleLoad(CATALOG_DIR);
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Record<string, Baseline>;
    const fix = 'npm run rule-load -- --baseline "<why>"';
    for (const [lang, load] of Object.entries(languages)) {
      const recorded = baseline[lang];
      assert.ok(recorded?.reason, `${lang}: no baseline with a reason; run ${fix}`);
      assert.ok(
        load.bytes <= recorded.bytes,
        `${lang} grew ${recorded.bytes} -> ${load.bytes} bytes; if intended, run ${fix}`,
      );
      assert.ok(
        recorded.bytes - load.bytes <= SLACK_BYTES,
        `${lang} shrank ${recorded.bytes} -> ${load.bytes} bytes; lower the baseline: ${fix}`,
      );
    }
  });
});
