/**
 * Tests for `family-tools` (src/commands/sync/conformance/rules/family-tools.ts) — the
 * mechanical rule that holds every family member to the family's neutral tool list. detect() is
 * exercised through the exported pure helper with in-memory catalogs; fix() reads the standard
 * from a temp catalog root, so it runs against the same fixture data.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  familyToolFindings,
  familyToolsRule,
} from '../../dist-cli/commands/sync/conformance/rules/family-tools';
import type { ConformanceContext } from '../../dist-cli/commands/sync/conformance/types';
import { parseCatalogStandard } from '../../dist-cli/catalog-standard';
import type { LoadedCatalog } from '../../dist-cli/types';
import { loadBundledCatalog } from '../helpers/catalog';
import { makeAgent, makeCatalog, makeSkill } from '../helpers/fixtures';
import { withTempDirAsync } from '../helpers/temp-dir';

const AGENT_ID = 'shared/code-reviewer';
const SKILL_ID = 'csharp/cs-generate-tests';
const READ_SEARCH = '    tools:\n      allow: [read, search]\n';
const NEAREST = '    tools:\n      allow: [read, search]\n      policy: nearest\n';
const SKILL_TOOLS = '    allowedTools: [shell, read]\n';

/** The standard `raw` as YAML, with one family whose single member the fixtures define. */
function standardOf(kind: 'agent' | 'skill', tail: string) {
  const id = kind === 'agent' ? AGENT_ID : SKILL_ID;
  const raw = `families:\n  - id: reviewers\n    kind: ${kind}\n    members: [${id}]\n${tail}`;
  return { raw, standard: parseCatalogStandard(raw, 'standard.yaml') };
}

/** A conformance context over one in-memory artifact, optionally anchored at a disk root. */
function contextFor(artifact: unknown, root?: string): ConformanceContext {
  const catalog = makeCatalog([artifact as Record<string, unknown>]);
  return {
    catalog: { ...catalog, ...(root ? { root } : {}) } as unknown as LoadedCatalog,
    targets: [],
  };
}

/** The findings for one artifact against `standard`. */
function findingsFor(
  standard: ReturnType<typeof parseCatalogStandard>,
  artifact: unknown,
): ReturnType<typeof familyToolFindings> {
  return familyToolFindings(standard, contextFor(artifact).catalog);
}

/** The fix's patch for `finding`, with `standard`'s YAML as the catalog root's standard.yaml. */
async function fixedPatch(
  standard: ReturnType<typeof standardOf>,
  artifact: unknown,
  finding: Parameters<NonNullable<typeof familyToolsRule.fix>>[0],
) {
  let patch: Record<string, unknown> | undefined;
  await withTempDirAsync(async root => {
    fs.writeFileSync(path.join(root, 'standard.yaml'), standard.raw);
    patch = familyToolsRule.fix?.(finding, contextFor(artifact, root))?.frontmatterPatch;
  });
  return patch;
}

describe('family-tools — detect', () => {
  it('accepts a member whose legacy names normalize to the family set', () => {
    const { standard } = standardOf('agent', READ_SEARCH);
    const artifact = makeAgent({ tools: ['Read', 'Grep', 'Glob'] });
    assert.deepEqual(findingsFor(standard, artifact), []);
  });

  it('flags a member whose normalized set is narrower than the family set', () => {
    const { standard } = standardOf('agent', READ_SEARCH);
    const findings = findingsFor(standard, makeAgent({ tools: ['read'] }));
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.ruleId, 'family-tools');
    assert.equal(findings[0]!.severity, 'error');
    assert.match(findings[0]!.detail, /reviewers/);
    assert.match(findings[0]!.detail, /\[read\].*\[read, search\]/);
  });

  it('skips a member the family lists in toolExceptions', () => {
    const tail = `${READ_SEARCH}    toolExceptions:\n      ${AGENT_ID}: reads only\n`;
    const { standard } = standardOf('agent', tail);
    assert.deepEqual(findingsFor(standard, makeAgent({ tools: ['read'] })), []);
  });

  it('flags a member with no tools list', () => {
    const { standard } = standardOf('agent', READ_SEARCH);
    const findings = findingsFor(standard, makeAgent());
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.detail, "missing tools; family 'reviewers' sets [read, search]");
  });

  it('checks nothing when the family declares no tool default', () => {
    const { standard } = standardOf('agent', '');
    assert.deepEqual(findingsFor(standard, makeAgent({ tools: ['read'] })), []);
  });

  it('flags a member whose policy differs from the family default', () => {
    const { standard } = standardOf('agent', NEAREST);
    const findings = findingsFor(standard, makeAgent({ tools: ['read', 'search'] }));
    assert.equal(findings.length, 1);
    assert.match(findings[0]!.detail, /toolPolicy 'strict'.*'nearest'/);
  });

  it('compares a skill family allowedTools as a normalized set', () => {
    const { standard } = standardOf('skill', SKILL_TOOLS);
    assert.deepEqual(findingsFor(standard, makeSkill({ allowedTools: ['Bash', 'Read'] })), []);
    const findings = findingsFor(standard, makeSkill({ allowedTools: ['read'] }));
    assert.equal(findings.length, 1);
    assert.match(findings[0]!.detail, /allowedTools \[read\].*\[shell, read\]/);
  });

  it('reports nothing for the bundled catalog, which sets no family tool data yet', async () => {
    const catalog = await loadBundledCatalog();
    assert.deepEqual(familyToolsRule.detect({ catalog, targets: [] }), []);
  });
});

describe('family-tools — fix', () => {
  it('writes the family list when the member has no tools', async () => {
    const standard = standardOf('agent', READ_SEARCH);
    const artifact = makeAgent();
    const [finding] = findingsFor(standard.standard, artifact);
    assert.deepEqual(await fixedPatch(standard, artifact, finding!), {
      tools: ['read', 'search'],
    });
  });

  it('adds the nearest policy but leaves an existing tools list alone', async () => {
    const standard = standardOf('agent', NEAREST);
    const artifact = makeAgent({ tools: ['read', 'search'] });
    const [finding] = findingsFor(standard.standard, artifact);
    assert.deepEqual(await fixedPatch(standard, artifact, finding!), {
      toolPolicy: 'nearest',
    });
  });

  it('does not rewrite a value that differs', async () => {
    const standard = standardOf('agent', READ_SEARCH);
    const artifact = makeAgent({ tools: ['read'] });
    const [finding] = findingsFor(standard.standard, artifact);
    assert.equal(await fixedPatch(standard, artifact, finding!), undefined);
  });
});
