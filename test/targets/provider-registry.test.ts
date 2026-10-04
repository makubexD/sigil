/**
 * `registerTarget()` is the only provider list: every cross-provider list (specs, doc citations,
 * lexicon literals, foreign-literal forbids) is derived from the registered targets, so a new
 * provider is one folder plus one `registerTarget()` call. Each test file runs in its own process,
 * so registering a probe target here doesn't leak into other tests.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  allProviderDocRefs,
  allProviderSpecs,
  contractsFor,
  foreignLiteralForbids,
} from '../../dist-cli/targets/all-emit-specs';
import { getAllTargets, getTarget, registerTarget } from '../../dist-cli/targets/index';
import type { Target } from '../../dist-cli/types';

const SRC = path.resolve(__dirname, '../../src');
const TARGETS_DIR = path.join(SRC, 'targets');
const REGISTRY = path.join(TARGETS_DIR, 'index.ts');
const PROVIDER_DIRS = ['claude-code', 'copilot'];
// Static `from '…'` and dynamic `import('…')` specifiers.
const IMPORT_RE = /(?:from\s+|import\()\s*['"]([^'"]+)['"]/g;

/** The provider folder `file` lives in, if any. */
function providerOf(file: string): string | undefined {
  const rel = path.relative(TARGETS_DIR, file).split(path.sep);
  return rel.length > 1 && PROVIDER_DIRS.includes(rel[0]!) ? rel[0] : undefined;
}

/** The provider folders `file` imports from, by resolving each relative specifier. */
function importedProviders(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(IMPORT_RE)]
    .map(m => m[1]!)
    .filter(spec => spec.startsWith('.'))
    .map(spec => providerOf(path.resolve(path.dirname(file), spec, 'x.ts')))
    .filter((p): p is string => p !== undefined);
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

const PROBE_DOC = {
  url: 'https://example.test/probe',
  title: 'Probe',
  verifiedOn: '2026-10-04',
  covers: 'probe',
};
const probeTarget = {
  ...getTarget('copilot'),
  name: 'probe',
  emitSpecs: getTarget('copilot').emitSpecs,
  lexicon: {
    'conventions-file': { value: 'PROBE.md', doc: PROBE_DOC, forbidElsewhere: true },
    'rules-dir': { value: '.probe/rules/', doc: PROBE_DOC },
    'skills-dir': { value: '.probe/skills/', doc: PROBE_DOC },
    arguments: { value: '$PROBE', doc: PROBE_DOC },
  },
  aggregateDocs: [{ source: 'probe aggregate', doc: PROBE_DOC }],
} as unknown as Target;

describe('provider registry', () => {
  it('should import a provider folder only from itself or src/targets/index.ts', () => {
    const offenders = sourceFiles(SRC)
      .filter(file => file !== REGISTRY)
      .flatMap(file =>
        importedProviders(file)
          .filter(provider => provider !== providerOf(file))
          .map(provider => `${path.relative(SRC, file)} -> ${provider}`),
      );
    assert.deepEqual(offenders, []);
  });

  it("should forbid another provider's flagged literals, never a provider's own", () => {
    const onCopilot = foreignLiteralForbids('copilot').map(f => f.pattern.source);
    assert.ok(
      onCopilot.some(p => p.includes('CLAUDE')),
      onCopilot.join(' '),
    );
    assert.ok(
      onCopilot.some(p => p.includes('ARGUMENTS')),
      onCopilot.join(' '),
    );
    assert.equal(foreignLiteralForbids('claude').length, 0);
  });

  it("should add the foreign forbids to every one of a target's contracts", () => {
    for (const entry of contractsFor(getTarget('copilot'))) {
      assert.ok(
        (entry.contract.bodyForbids ?? []).some(f => f.pattern.test('Read CLAUDE.md first')),
        entry.label,
      );
    }
    for (const entry of contractsFor(getTarget('claude'))) {
      assert.ok(
        !(entry.contract.bodyForbids ?? []).some(f => f.pattern.test('Read CLAUDE.md first')),
      );
    }
  });

  it('should pick up a newly registered target everywhere, with no other edit', () => {
    registerTarget(probeTarget);
    assert.ok(getAllTargets().some(t => t.name === 'probe'));
    assert.ok(allProviderSpecs().some(s => s.provider === 'probe'));
    assert.ok(allProviderDocRefs().some(r => r.source === 'probe aggregate'));
    const onCopilot = foreignLiteralForbids('copilot');
    assert.ok(onCopilot.some(f => f.pattern.test('see PROBE.md')));
    assert.ok(!foreignLiteralForbids('probe').some(f => f.pattern.test('see PROBE.md')));
  });
});
