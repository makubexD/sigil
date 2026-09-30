/**
 * Tests for src/commands/sync/{analyze,apply,render}.ts — the `sigil sync` drift analysis and
 * mechanical-fix writer. One test per row of the mechanical/review contract table in the plan
 * (docs/reference/spec.md § sigil sync).
 *
 * The CLI-level `--check` exit code and the `--apply` dirty-working-tree refusal both shell out to
 * `git`; they are exercised manually per the plan's Verification section rather than here, since
 * mocking `execFileSync` would test the mock, not the command.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeCatalog, findStaleDocs } from '../../dist-cli/commands/sync/analyze';
import { applyFindings, buildRebuiltBody } from '../../dist-cli/commands/sync/apply';
import { renderApplySummary, renderReport } from '../../dist-cli/commands/sync/render';
import type { Artifact, LoadedCatalog } from '../../dist-cli/types';

const REQUIRED_SLOT = { key: 'whenToUse', required: true, description: 'Trigger conditions.' };
const NEW_REQUIRED_SLOT = { key: 'gotchas', required: true, description: 'Known pitfalls.' };
const RENAMED_SLOT = {
  key: 'usage',
  required: true,
  description: 'How to use it.',
  renamedFrom: 'whenToUse',
};

function makeTemplate(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'shared/templates/workflow-skill',
    kind: 'template',
    filePath: '/fake/workflow-skill.template.md',
    frontmatter: {
      id: 'shared/templates/workflow-skill',
      kind: 'template',
      title: 'Workflow Skill',
      description: 'Ordered, step-driven skill template.',
      appliesToKind: ['skill'],
      revision: 1,
      slots: [REQUIRED_SLOT],
      docs: [{ url: 'https://example.com/docs', verifiedOn: '2026-01-01', covers: 'layout' }],
    },
    body: '## When to Use\n\n<!-- slot: whenToUse -->\n\nShared closing line that is long enough.',
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'typescript/ts-probe',
    kind: 'skill',
    filePath: '/fake/ts-probe/SKILL.md',
    frontmatter: {
      id: 'typescript/ts-probe',
      kind: 'skill',
      template: 'shared/templates/workflow-skill',
    },
    body: '<!-- slot: whenToUse -->\nUse this when probing.',
    ...overrides,
  };
}

function makeCatalog(artifacts: Artifact[]): LoadedCatalog {
  return {
    artifacts,
    byId: new Map(artifacts.map(a => [a.id, a])),
    languages: new Map(),
    skipWarnings: [],
  } as unknown as LoadedCatalog;
}

describe('analyzeCatalog', () => {
  it('should report no drift when the artifact fills exactly what the template declares', () => {
    // Arrange
    const catalog = makeCatalog([makeTemplate(), makeArtifact()]);

    // Act
    const findings = analyzeCatalog(catalog);

    // Assert
    assert.deepEqual(findings, []);
  });

  it('should report a mechanical missing-required-slot drift for a new required slot', () => {
    // Arrange
    const template = makeTemplate({
      frontmatter: {
        ...makeTemplate().frontmatter,
        slots: [REQUIRED_SLOT, NEW_REQUIRED_SLOT],
      },
    });
    const catalog = makeCatalog([template, makeArtifact()]);

    // Act
    const findings = analyzeCatalog(catalog);

    // Assert
    assert.equal(findings.length, 1);
    const drift = findings[0]!.drifts.find(d => d.kind === 'missing-required-slot');
    assert.ok(drift);
    assert.equal(drift!.class, 'mechanical');
    assert.equal(drift!.slotKey, 'gotchas');
  });

  it('should report a mechanical slot-renamed drift when the artifact still uses the old key', () => {
    // Arrange
    const template = makeTemplate({
      frontmatter: { ...makeTemplate().frontmatter, slots: [RENAMED_SLOT] },
    });
    const catalog = makeCatalog([template, makeArtifact()]);

    // Act
    const findings = analyzeCatalog(catalog);

    // Assert
    const drift = findings[0]!.drifts.find(d => d.kind === 'slot-renamed');
    assert.ok(drift);
    assert.equal(drift!.class, 'mechanical');
    assert.equal(drift!.slotKey, 'whenToUse');
    assert.equal(drift!.renameTo, 'usage');
  });

  it('should report a mechanical slot-removed drift for a key the template no longer declares', () => {
    // Arrange — the artifact fills a stray 'stale' key the template never declared.
    const artifact = makeArtifact({
      body: '<!-- slot: whenToUse -->\nok\n<!-- slot: stale -->\nleftover',
    });
    const catalog = makeCatalog([makeTemplate(), artifact]);

    // Act
    const findings = analyzeCatalog(catalog);

    // Assert
    const drift = findings[0]!.drifts.find(d => d.kind === 'slot-removed');
    assert.ok(drift);
    assert.equal(drift!.class, 'mechanical');
    assert.equal(drift!.slotKey, 'stale');
  });

  it('should report a mechanical duplicated-prose drift when a slot repeats a template line verbatim', () => {
    // Arrange
    const DUPLICATED_LINE = 'Shared closing line that is long enough.';
    const artifact = makeArtifact({
      body: `<!-- slot: whenToUse -->\nUse this when probing.\n${DUPLICATED_LINE}`,
    });
    const catalog = makeCatalog([makeTemplate(), artifact]);

    // Act
    const findings = analyzeCatalog(catalog);

    // Assert
    const drift = findings[0]!.drifts.find(d => d.kind === 'duplicated-prose');
    assert.ok(drift);
    assert.equal(drift!.class, 'mechanical');
    assert.equal(drift!.line, DUPLICATED_LINE);
  });

  it('should report a review-class structural-error drift that --apply must not touch', () => {
    // Arrange — content before the first marker is a parseSlots structural error.
    const artifact = makeArtifact({ body: 'stray prose\n<!-- slot: whenToUse -->\ncontent' });
    const catalog = makeCatalog([makeTemplate(), artifact]);

    // Act
    const findings = analyzeCatalog(catalog);

    // Assert
    const drift = findings[0]!.drifts.find(d => d.kind === 'structural-error');
    assert.ok(drift);
    assert.equal(drift!.class, 'review');
  });

  it('should scope findings to templateFilter when given', () => {
    // Arrange
    const otherTemplate = makeTemplate({
      id: 'shared/templates/other',
      frontmatter: { ...makeTemplate().frontmatter, id: 'shared/templates/other' },
    });
    const drifted = makeArtifact({ body: 'stray\n<!-- slot: whenToUse -->\nx' });
    const driftedOther = makeArtifact({
      id: 'typescript/ts-other',
      frontmatter: { id: 'typescript/ts-other', kind: 'skill', template: 'shared/templates/other' },
      body: 'stray\n<!-- slot: whenToUse -->\nx',
    });
    const catalog = makeCatalog([makeTemplate(), otherTemplate, drifted, driftedOther]);

    // Act
    const findings = analyzeCatalog(catalog, 'shared/templates/other');

    // Assert
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.artifactId, 'typescript/ts-other');
  });
});

describe('findStaleDocs', () => {
  it('should flag a template doc verified more than staleMonths ago', () => {
    // Arrange
    const template = makeTemplate({
      frontmatter: {
        ...makeTemplate().frontmatter,
        docs: [{ url: 'https://example.com/docs', verifiedOn: '2020-01-01', covers: 'layout' }],
      },
    });
    const catalog = makeCatalog([template]);

    // Act
    const stale = findStaleDocs(catalog, 6);

    // Assert
    assert.equal(stale.length, 1);
    assert.equal(stale[0]!.source, template.id);
  });

  it('should not flag a doc verified within staleMonths', () => {
    // Arrange
    const recentDate = new Date().toISOString().slice(0, 10);
    const template = makeTemplate({
      frontmatter: {
        ...makeTemplate().frontmatter,
        docs: [{ url: 'https://example.com/docs', verifiedOn: recentDate, covers: 'layout' }],
      },
    });
    const catalog = makeCatalog([template]);

    // Act
    const stale = findStaleDocs(catalog, 6);

    // Assert
    assert.deepEqual(stale, []);
  });
});

describe('buildRebuiltBody', () => {
  it('should insert a TODO stub for a missing required slot, in template order', () => {
    // Arrange
    const template = makeTemplate({
      frontmatter: { ...makeTemplate().frontmatter, slots: [REQUIRED_SLOT, NEW_REQUIRED_SLOT] },
    });
    const artifact = makeArtifact();
    const catalog = makeCatalog([template, artifact]);
    const [finding] = analyzeCatalog(catalog);

    // Act
    const rebuilt = buildRebuiltBody(artifact, template, template.frontmatter as never, finding!);

    // Assert
    assert.ok(rebuilt);
    assert.match(rebuilt!, /<!-- slot: gotchas -->\nTODO: Known pitfalls\./);
    assert.ok(rebuilt!.indexOf('whenToUse') < rebuilt!.indexOf('gotchas'));
  });

  it('should rewrite a renamed slot marker while preserving its content', () => {
    // Arrange
    const template = makeTemplate({
      frontmatter: { ...makeTemplate().frontmatter, slots: [RENAMED_SLOT] },
    });
    const artifact = makeArtifact();
    const catalog = makeCatalog([template, artifact]);
    const [finding] = analyzeCatalog(catalog);

    // Act
    const rebuilt = buildRebuiltBody(artifact, template, template.frontmatter as never, finding!);

    // Assert
    assert.equal(rebuilt, '<!-- slot: usage -->\nUse this when probing.\n');
  });

  it('should drop a removed slot block entirely', () => {
    // Arrange
    const artifact = makeArtifact({
      body: '<!-- slot: whenToUse -->\nok\n<!-- slot: stale -->\nleftover',
    });
    const template = makeTemplate();
    const catalog = makeCatalog([template, artifact]);
    const [finding] = analyzeCatalog(catalog);

    // Act
    const rebuilt = buildRebuiltBody(artifact, template, template.frontmatter as never, finding!);

    // Assert
    assert.doesNotMatch(rebuilt!, /stale/);
    assert.doesNotMatch(rebuilt!, /leftover/);
  });

  it('should strip a duplicated-prose line from the slot content', () => {
    // Arrange
    const DUPLICATED_LINE = 'Shared closing line that is long enough.';
    const artifact = makeArtifact({
      body: `<!-- slot: whenToUse -->\nUse this when probing.\n${DUPLICATED_LINE}`,
    });
    const template = makeTemplate();
    const catalog = makeCatalog([template, artifact]);
    const [finding] = analyzeCatalog(catalog);

    // Act
    const rebuilt = buildRebuiltBody(artifact, template, template.frontmatter as never, finding!);

    // Assert
    assert.doesNotMatch(rebuilt!, /Shared closing line/);
    assert.match(rebuilt!, /Use this when probing\./);
  });

  it('should return undefined when every drift is review-class', () => {
    // Arrange
    const artifact = makeArtifact({ body: 'stray\n<!-- slot: whenToUse -->\nx' });
    const template = makeTemplate();
    const catalog = makeCatalog([template, artifact]);
    const [finding] = analyzeCatalog(catalog);

    // Act
    const rebuilt = buildRebuiltBody(artifact, template, template.frontmatter as never, finding!);

    // Assert
    assert.equal(rebuilt, undefined);
  });
});

describe('applyFindings', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-sync-'));
    filePath = path.join(tmpDir, 'SKILL.md');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should write the rebuilt body to disk, preserving the frontmatter block', () => {
    // Arrange
    const template = makeTemplate({
      frontmatter: { ...makeTemplate().frontmatter, slots: [REQUIRED_SLOT, NEW_REQUIRED_SLOT] },
    });
    const artifact = makeArtifact({ filePath });
    fs.writeFileSync(
      filePath,
      '---\nid: typescript/ts-probe\nkind: skill\ntemplate: shared/templates/workflow-skill\n---\n' +
        artifact.body,
      'utf-8',
    );
    const catalog = makeCatalog([template, artifact]);
    const findings = analyzeCatalog(catalog);

    // Act
    const results = applyFindings(catalog, findings);

    // Assert
    assert.equal(results.length, 1);
    assert.equal(results[0]!.appliedDrifts, 1);
    const written = fs.readFileSync(filePath, 'utf-8');
    assert.match(written, /^---\nid: typescript\/ts-probe/);
    assert.match(written, /<!-- slot: gotchas -->\nTODO:/);
  });

  it('should leave a review-only finding unwritten and count it as skipped', () => {
    // Arrange
    const artifact = makeArtifact({ filePath, body: 'stray\n<!-- slot: whenToUse -->\nx' });
    fs.writeFileSync(
      filePath,
      '---\nid: typescript/ts-probe\nkind: skill\ntemplate: shared/templates/workflow-skill\n---\n' +
        artifact.body,
      'utf-8',
    );
    const template = makeTemplate();
    const catalog = makeCatalog([template, artifact]);
    const findings = analyzeCatalog(catalog);
    const before = fs.readFileSync(filePath, 'utf-8');

    // Act
    const results = applyFindings(catalog, findings);

    // Assert
    assert.equal(results.length, 1);
    assert.equal(results[0]!.appliedDrifts, 0);
    assert.equal(results[0]!.skippedReviewDrifts, 1);
    assert.equal(fs.readFileSync(filePath, 'utf-8'), before);
  });
});

describe('renderReport / renderApplySummary', () => {
  it('should render the all-clean message when there is no drift and no stale docs', () => {
    // Act
    const text = renderReport({ findings: [], stale: [], superseded: [], conformance: [] }, false);

    // Assert
    assert.match(text, /No template drift or conformance findings/);
  });

  it('should render valid JSON when json is true', () => {
    // Arrange
    const catalog = makeCatalog([
      makeTemplate({ frontmatter: { ...makeTemplate().frontmatter, slots: [NEW_REQUIRED_SLOT] } }),
      makeArtifact(),
    ]);
    const findings = analyzeCatalog(catalog);

    // Act
    const text = renderReport({ findings, stale: [], superseded: [], conformance: [] }, true);

    // Assert
    const parsed = JSON.parse(text) as { findings: unknown[] };
    assert.equal(parsed.findings.length, 1);
  });

  it('should render the nothing-to-apply message for an empty apply result', () => {
    // Act
    const text = renderApplySummary([], [], [], false);

    // Assert
    assert.match(text, /Nothing to apply/);
  });
});
