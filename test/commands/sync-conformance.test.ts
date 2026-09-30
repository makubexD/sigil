/**
 * Tests for src/commands/sync/conformance/ — the catalog-vs-standard engine that joins template
 * drift as `sigil sync`'s second analyzer. One test per rule's detect() (using a small in-memory
 * catalog, matching the real detect() signal each rule was designed to catch), plus fix-mechanical
 * for the one rule with a deterministic fix, plus all four editorial rails rejecting a bad
 * model proposal.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runConformance } from '../../dist-cli/commands/sync/conformance/detect';
import { applyMechanicalFindings } from '../../dist-cli/commands/sync/conformance/fix-mechanical';
import { runEditorialFindings } from '../../dist-cli/commands/sync/conformance/fix-editorial';
import type {
  EditorialModelClient,
  EditorialProposal,
} from '../../dist-cli/commands/sync/conformance/editorial-model-client';
import { getAllTargets } from '../../dist-cli/targets/index';
import type { Artifact, LoadedCatalog, Target } from '../../dist-cli/types';

function makeCatalog(artifacts: Artifact[]): LoadedCatalog {
  return {
    artifacts,
    byId: new Map(artifacts.map(a => [a.id, a])),
    languages: new Map(),
    skipWarnings: [],
  } as unknown as LoadedCatalog;
}

function makeSkillArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'csharp/cs-probe',
    kind: 'skill',
    filePath: '/fake/cs-probe/SKILL.md',
    frontmatter: { id: 'csharp/cs-probe', kind: 'skill', name: 'cs-probe', language: 'csharp' },
    body: '## When to Use\n\nUse this when probing things.\n\n## Steps\n\n1. Probe.',
    ...overrides,
  } as Artifact;
}

describe('conformance rule: when-to-use-lift', () => {
  it('flags a skill with "## When to Use" body prose and no whenToUse frontmatter', () => {
    const catalog = makeCatalog([makeSkillArtifact()]);
    const findings = runConformance(catalog, [], { ruleId: 'when-to-use-lift' });
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.artifactId, 'csharp/cs-probe');
    assert.equal(findings[0]!.severity, 'error');
  });

  it('does not flag a skill that already has whenToUse frontmatter', () => {
    const catalog = makeCatalog([
      makeSkillArtifact({ frontmatter: { ...makeSkillArtifact().frontmatter, whenToUse: 'x' } }),
    ]);
    const findings = runConformance(catalog, [], { ruleId: 'when-to-use-lift' });
    assert.equal(findings.length, 0);
  });
});

describe('conformance rule: when-to-use-lift — fix', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-conformance-'));
    filePath = path.join(tmpDir, 'SKILL.md');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lifts the "## When to Use" section into whenToUse frontmatter and strips it from the body', () => {
    const artifact = makeSkillArtifact({ filePath });
    fs.writeFileSync(
      filePath,
      '---\nid: csharp/cs-probe\nkind: skill\nname: cs-probe\nlanguage: csharp\n---\n\n' +
        artifact.body,
      'utf-8',
    );
    const catalog = makeCatalog([artifact]);
    const findings = runConformance(catalog, [], { ruleId: 'when-to-use-lift' });

    const results = applyMechanicalFindings(findings, { catalog, targets: [] });

    assert.equal(results.length, 1);
    const written = fs.readFileSync(filePath, 'utf-8');
    assert.match(written, /whenToUse: Use this when probing things\./);
    assert.doesNotMatch(written, /## When to Use/);
    assert.match(written, /## Steps/);
  });
});

describe('conformance rule: body-density', () => {
  it('flags a skill body over the line-count threshold', () => {
    const longBody = Array.from({ length: 120 }, (_, i) => `line ${i}`).join('\n');
    const catalog = makeCatalog([makeSkillArtifact({ body: longBody })]);
    const findings = runConformance(catalog, [], { ruleId: 'body-density' });
    assert.equal(findings.length, 1);
  });

  it('does not flag a short skill body', () => {
    const catalog = makeCatalog([makeSkillArtifact({ body: 'short' })]);
    const findings = runConformance(catalog, [], { ruleId: 'body-density' });
    assert.equal(findings.length, 0);
  });
});

describe('conformance rule: platform-path-leak', () => {
  it('flags a rule body that hardcodes .claude/', () => {
    const artifact: Artifact = {
      id: 'csharp/cs-probe',
      kind: 'rule',
      filePath: '/fake/cs-probe.rule.md',
      frontmatter: { id: 'csharp/cs-probe', kind: 'rule' },
      body: 'Discover conventions from CLAUDE.md and .claude/ rules if present.',
    };
    const catalog = makeCatalog([artifact]);
    const findings = runConformance(catalog, [], { ruleId: 'platform-path-leak' });
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.provider, 'copilot');
  });

  it('does not flag a settings artifact (ownedBy claude — legitimate)', () => {
    const artifact: Artifact = {
      id: 'shared/allow-dev-tools',
      kind: 'settings',
      filePath: '/fake/allow-dev-tools.settings.md',
      frontmatter: { id: 'shared/allow-dev-tools', kind: 'settings' },
      body: 'Merges into your .claude/settings.json',
    };
    const catalog = makeCatalog([artifact]);
    const findings = runConformance(catalog, [], { ruleId: 'platform-path-leak' });
    assert.equal(findings.length, 0);
  });
});

describe('conformance rule: applies-to-rationale', () => {
  it('flags a rule with a non-default appliesTo and no rationale', () => {
    const artifact: Artifact = {
      id: 'csharp/cs-nuget',
      kind: 'rule',
      filePath: '/fake/cs-nuget.rule.md',
      frontmatter: { id: 'csharp/cs-nuget', kind: 'rule', appliesTo: ['**/*.csproj'] },
      body: 'body',
    };
    const catalog = makeCatalog([artifact]);
    const findings = runConformance(catalog, [], { ruleId: 'applies-to-rationale' });
    assert.equal(findings.length, 1);
  });

  it('does not flag a rule with the default appliesTo', () => {
    const artifact: Artifact = {
      id: 'shared/clean-code',
      kind: 'rule',
      filePath: '/fake/clean-code.rule.md',
      frontmatter: { id: 'shared/clean-code', kind: 'rule', appliesTo: ['**/*'] },
      body: 'body',
    };
    const catalog = makeCatalog([artifact]);
    const findings = runConformance(catalog, [], { ruleId: 'applies-to-rationale' });
    assert.equal(findings.length, 0);
  });
});

describe('conformance rule: related-artifacts', () => {
  function agent(id: string, language: string): Artifact {
    return {
      id,
      kind: 'agent',
      filePath: `/fake/${id}.agent.md`,
      frontmatter: { id, kind: 'agent', language, description: 'desc' },
      body: 'body',
    } as Artifact;
  }

  it('flags an agent with no relatedArtifacts when a same-language sibling exists', () => {
    const catalog = makeCatalog([agent('csharp/cs-a', 'csharp'), agent('csharp/cs-b', 'csharp')]);
    const findings = runConformance(catalog, [], { ruleId: 'related-artifacts' });
    assert.equal(findings.length, 2);
  });

  it('does not flag an agent with no plausible sibling (only agent in its language)', () => {
    const catalog = makeCatalog([agent('python/py-a', 'python')]);
    const findings = runConformance(catalog, [], { ruleId: 'related-artifacts' });
    assert.equal(findings.length, 0);
  });
});

describe('conformance rule: provider-kind-coverage', () => {
  it('passes against the real registered targets (regression guard for the copilot/workflow gap)', () => {
    const catalog = makeCatalog([]);
    const findings = runConformance(catalog, getAllTargets(), { ruleId: 'provider-kind-coverage' });
    assert.equal(findings.length, 0);
  });

  it('flags a target declaring a whole-file kind with no matching spec', () => {
    const fakeTarget: Target = {
      name: 'fake-provider',
      supportedKinds: ['skill'],
      compile: async () => ({}),
    };
    const catalog = makeCatalog([]);
    const findings = runConformance(catalog, [fakeTarget], { ruleId: 'provider-kind-coverage' });
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.provider, 'fake-provider');
  });
});

describe('conformance rule: deprecated-hygiene', () => {
  it('flags a deprecated artifact with no supersededBy', () => {
    const artifact: Artifact = {
      id: 'csharp/cs-old',
      kind: 'rule',
      filePath: '/fake/cs-old.rule.md',
      frontmatter: {
        id: 'csharp/cs-old',
        kind: 'rule',
        deprecated: { since: '1.0', reason: 'retired' },
      },
      body: 'body',
    };
    const catalog = makeCatalog([artifact]);
    const findings = runConformance(catalog, [], { ruleId: 'deprecated-hygiene' });
    assert.equal(findings.length, 1);
  });

  it('does not flag a deprecated artifact that names its replacement', () => {
    const artifact: Artifact = {
      id: 'csharp/cs-old',
      kind: 'rule',
      filePath: '/fake/cs-old.rule.md',
      frontmatter: {
        id: 'csharp/cs-old',
        kind: 'rule',
        deprecated: { since: '1.0', reason: 'retired', supersededBy: 'csharp/cs-new' },
      },
      body: 'body',
    };
    const catalog = makeCatalog([artifact]);
    const findings = runConformance(catalog, [], { ruleId: 'deprecated-hygiene' });
    assert.equal(findings.length, 0);
  });
});

describe('conformance scoping — --kind/--language/--provider/--rule', () => {
  it('--language scopes findings to artifacts in that language', () => {
    const catalog = makeCatalog([
      makeSkillArtifact({
        id: 'csharp/cs-probe',
        frontmatter: { id: 'csharp/cs-probe', kind: 'skill', language: 'csharp' },
      }),
      makeSkillArtifact({
        id: 'typescript/ts-probe',
        frontmatter: { id: 'typescript/ts-probe', kind: 'skill', language: 'typescript' },
      }),
    ]);
    const findings = runConformance(catalog, [], {
      ruleId: 'when-to-use-lift',
      language: 'csharp',
    });
    assert.equal(findings.length, 1);
    assert.equal(findings[0]!.artifactId, 'csharp/cs-probe');
  });

  it('--kind excludes non-matching artifacts even when the rule scans all kinds', () => {
    const skill = makeSkillArtifact();
    const rule: Artifact = {
      id: 'csharp/cs-rule',
      kind: 'rule',
      filePath: '/fake/cs-rule.rule.md',
      frontmatter: { id: 'csharp/cs-rule', kind: 'rule', appliesTo: ['**/*.cs'] },
      body: '.claude/ mentioned here',
    };
    const catalog = makeCatalog([skill, rule]);
    const all = runConformance(catalog, [], { ruleId: 'platform-path-leak' });
    const scoped = runConformance(catalog, [], { ruleId: 'platform-path-leak', kind: 'rule' });
    assert.ok(all.length >= scoped.length);
    assert.ok(scoped.every(f => f.artifactId === 'csharp/cs-rule'));
  });
});

describe('editorial pass — the four correctness rails', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-editorial-'));
    filePath = path.join(tmpDir, 'cs-probe.rule.md');
    fs.writeFileSync(
      filePath,
      '---\nid: csharp/cs-probe\nkind: rule\ntitle: Probe\ndescription: "A probe rule."\n' +
        'appliesTo:\n  - "**/*.cs"\n---\n\nBody text.',
      'utf-8',
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function ruleFinding() {
    const artifact: Artifact = {
      id: 'csharp/cs-probe',
      kind: 'rule',
      filePath,
      frontmatter: {
        id: 'csharp/cs-probe',
        kind: 'rule',
        title: 'Probe',
        description: 'A probe rule.',
        appliesTo: ['**/*.cs'],
      },
      body: 'Body text.',
    };
    return {
      catalog: makeCatalog([artifact]),
      findings: [
        {
          ruleId: 'applies-to-rationale',
          severity: 'warning' as const,
          artifactId: 'csharp/cs-probe',
          filePath,
          detail: 'no rationale',
        },
      ],
    };
  }

  it('rejects a proposal that touches an identity field', async () => {
    const { catalog, findings } = ruleFinding();
    const badClient: EditorialModelClient = async () =>
      ({
        frontmatterPatch: { id: 'csharp/cs-hijacked', appliesToRationale: 'x' },
      }) as EditorialProposal;
    const results = await runEditorialFindings(findings, { catalog, targets: [] }, badClient);
    assert.equal(results.length, 1);
    assert.equal(results[0]!.status, 'rejected');
    assert.match(results[0]!.reason ?? '', /identity field/);
  });

  it('rejects a proposal that touches a field the task does not own', async () => {
    const { catalog, findings } = ruleFinding();
    const badClient: EditorialModelClient = async () =>
      ({ frontmatterPatch: { appliesToRationale: 'x', title: 'Hijacked' } }) as EditorialProposal;
    const results = await runEditorialFindings(findings, { catalog, targets: [] }, badClient);
    assert.equal(results[0]!.status, 'rejected');
    assert.match(results[0]!.reason ?? '', /does not own/);
  });

  it('rejects a proposal whose frontmatter fails the kind schema', async () => {
    const { catalog, findings } = ruleFinding();
    const badClient: EditorialModelClient = async () =>
      ({ frontmatterPatch: { appliesToRationale: 123 } }) as unknown as EditorialProposal;
    const results = await runEditorialFindings(findings, { catalog, targets: [] }, badClient);
    assert.equal(results[0]!.status, 'rejected');
    assert.match(results[0]!.reason ?? '', /schema/);
  });

  it('writes the file when the proposal clears every rail', async () => {
    const { catalog, findings } = ruleFinding();
    const goodClient: EditorialModelClient = async () =>
      ({
        frontmatterPatch: { appliesToRationale: 'Scoped to C# project files only.' },
      }) as EditorialProposal;
    const results = await runEditorialFindings(findings, { catalog, targets: [] }, goodClient);
    assert.equal(results[0]!.status, 'written');
    const written = fs.readFileSync(filePath, 'utf-8');
    assert.match(written, /appliesToRationale: Scoped to C# project files only\./);
  });

  it('rejects when the model client itself throws (e.g. missing ANTHROPIC_API_KEY)', async () => {
    const { catalog, findings } = ruleFinding();
    const throwingClient: EditorialModelClient = async () => {
      throw new Error('sync --apply --editorial requires ANTHROPIC_API_KEY');
    };
    const results = await runEditorialFindings(findings, { catalog, targets: [] }, throwingClient);
    assert.equal(results[0]!.status, 'rejected');
    assert.match(results[0]!.reason ?? '', /ANTHROPIC_API_KEY/);
  });
});
