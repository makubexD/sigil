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
import { applyFrontmatterPatch } from '../../dist-cli/commands/sync/conformance/frontmatter-patch';
import type {
  EditorialModelClient,
  EditorialProposal,
} from '../../dist-cli/commands/sync/conformance/editorial-model-client';
import { getAllTargets } from '../../dist-cli/targets/index';
import type { Artifact, LoadedCatalog, Target } from '../../dist-cli/types';
import { loadCatalog } from '../../dist-cli/load';
import { CATALOG_DIR } from '../helpers/catalog';
import { redundantDefaultRule } from '../../dist-cli/commands/sync/conformance/rules/redundant-default';

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

describe('applyFrontmatterPatch — overwriting an existing key', () => {
  it('replaces a single-line key with a new value (not just adds beside it)', () => {
    // Regression test: the original implementation built the "added" list from a Map it had
    // already deleted the key from while scanning "kept" — overwriting an EXISTING key silently
    // dropped it entirely instead of replacing it. Adding a brand-new key never exercised this
    // path, which is why it went unnoticed until an editorial rule overwrote one for real.
    const lines = ['id: test/probe', 'kind: skill', 'whenToUse: old text', 'name: probe'];
    const result = applyFrontmatterPatch(lines, { whenToUse: 'new text' });
    assert.deepEqual(result, [
      'id: test/probe',
      'kind: skill',
      'name: probe',
      'whenToUse: new text',
    ]);
  });

  it('drops every continuation line of a multi-line value being overwritten', () => {
    // A block scalar (`appliesTo:` style array, or `>-` folded scalar) spans multiple indented
    // lines — only the header line matching `key:` must never be enough to drop the whole value.
    const lines = [
      'id: test/probe',
      'appliesTo:',
      '  - "**/*.ts"',
      '  - "**/*.tsx"',
      'severity: recommended',
    ];
    const result = applyFrontmatterPatch(lines, { appliesTo: ['**/*.mts'] });
    assert.deepEqual(result, [
      'id: test/probe',
      'severity: recommended',
      'appliesTo:\n  - "**/*.mts"',
    ]);
  });

  it('adding a brand-new key still appends it without touching existing lines', () => {
    const lines = ['id: test/probe', 'kind: skill'];
    const result = applyFrontmatterPatch(lines, { whenToUse: 'new text' });
    assert.deepEqual(result, ['id: test/probe', 'kind: skill', 'whenToUse: new text']);
  });

  it('undefined removes an existing key entirely', () => {
    const lines = ['id: test/probe', 'deprecated: true'];
    const result = applyFrontmatterPatch(lines, { deprecated: undefined });
    assert.deepEqual(result, ['id: test/probe']);
  });
});

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

  it('preserves untouched frontmatter lines byte-for-byte (no reformatting of quoted values)', () => {
    // Regression test: the writer used to fully reserialize the frontmatter block, silently
    // stripping intentional double-quoting from title/argumentHint on every touched file.
    const body = '## When to Use\n\nUse this when probing.\n\n## Steps\n\n1. Probe.';
    const artifact = makeSkillArtifact({ filePath, body });
    fs.writeFileSync(
      filePath,
      '---\nid: csharp/cs-probe\nkind: skill\ntitle: "Probe (parens)"\n' +
        'argumentHint: "<package> [--dev]"\nname: cs-probe\nlanguage: csharp\n---\n\n' +
        body,
      'utf-8',
    );
    const catalog = makeCatalog([artifact]);
    const findings = runConformance(catalog, [], { ruleId: 'when-to-use-lift' });

    applyMechanicalFindings(findings, { catalog, targets: [] });

    const written = fs.readFileSync(filePath, 'utf-8');
    assert.match(written, /title: "Probe \(parens\)"/);
    assert.match(written, /argumentHint: "<package> \[--dev\]"/);
    assert.match(written, /whenToUse: Use this when probing\./);
  });

  it('does not leave an orphaned "---" divider when the removed section was followed by one', () => {
    // Regression test: "## When to Use\n\n...\n\n---\n\n# Title" left a bare "---" right after
    // frontmatter once the When to Use section was removed — that divider was the section's own
    // trailing separator, not a divider between two remaining sections.
    const body = '## When to Use\n\nUse this when probing.\n\n---\n\n# Title\n\nRest of body.';
    const artifact = makeSkillArtifact({ filePath, body });
    fs.writeFileSync(
      filePath,
      '---\nid: csharp/cs-probe\nkind: skill\nname: cs-probe\nlanguage: csharp\n---\n\n' + body,
      'utf-8',
    );
    const catalog = makeCatalog([artifact]);
    const findings = runConformance(catalog, [], { ruleId: 'when-to-use-lift' });

    applyMechanicalFindings(findings, { catalog, targets: [] });

    const written = fs.readFileSync(filePath, 'utf-8');
    const afterFrontmatter = written.split(/^---$/m).slice(2).join('---').trim();
    assert.ok(
      !afterFrontmatter.startsWith('---'),
      `body must not start with an orphaned divider, got: ${afterFrontmatter.slice(0, 40)}`,
    );
    assert.match(written, /# Title/);
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

describe('conformance rule: declared-but-unemitted', () => {
  function agentWithFrontmatter(frontmatter: Record<string, unknown>): Artifact {
    return {
      id: 'typescript/ts-probe',
      kind: 'agent',
      filePath: '/fake/ts-probe.agent.md',
      frontmatter: { id: 'typescript/ts-probe', kind: 'agent', name: 'ts-probe', ...frontmatter },
      body: 'body',
    } as Artifact;
  }

  it('passes against the real catalog and registered specs (regression guard for the tools gap)', async () => {
    // Real-catalog regression guard: this is the exact shape that caught `tools` being authored
    // on ~26 agents but mapped by neither provider spec — see declared-but-unemitted.ts's header.
    // Loading the actual catalog here (not just registered targets, like provider-kind-coverage's
    // guard) is required because the bug was in *catalog content* versus *spec coverage*, not in
    // target registration.
    const catalog = await loadCatalog(CATALOG_DIR);
    const findings = runConformance(catalog, [], { ruleId: 'declared-but-unemitted' });
    assert.equal(findings.length, 0);
  });

  it('flags a frontmatter key no registered spec for that kind maps', () => {
    const catalog = makeCatalog([agentWithFrontmatter({ bogusField: 'nope' })]);
    const findings = runConformance(catalog, [], { ruleId: 'declared-but-unemitted' });
    assert.equal(findings.length, 1);
    assert.match(findings[0]!.detail, /'bogusField'/);
  });

  it('does not flag a mapped field like tools', () => {
    const catalog = makeCatalog([agentWithFrontmatter({ tools: ['Read', 'Grep'] })]);
    const findings = runConformance(catalog, [], { ruleId: 'declared-but-unemitted' });
    assert.equal(findings.length, 0);
  });

  it('does not flag sigil-internal BaseFields like description/tags/severity', () => {
    const catalog = makeCatalog([
      agentWithFrontmatter({ description: 'desc', tags: ['x'], severity: 'recommended' }),
    ]);
    const findings = runConformance(catalog, [], { ruleId: 'declared-but-unemitted' });
    assert.equal(findings.length, 0);
  });

  it('does not flag config kinds (hook/settings/mcp) — they are JSON merges, not KindEmitSpec renders', () => {
    const hook: Artifact = {
      id: 'shared/probe-hook',
      kind: 'hook',
      filePath: '/fake/probe.hook.md',
      frontmatter: {
        id: 'shared/probe-hook',
        kind: 'hook',
        event: 'PreToolUse',
        command: 'echo hi',
      },
      body: 'body',
    } as Artifact;
    const catalog = makeCatalog([hook]);
    const findings = runConformance(catalog, [], { ruleId: 'declared-but-unemitted' });
    assert.equal(findings.length, 0);
  });
});

describe('conformance rule: redundant-default', () => {
  function ruleArtifact(frontmatter: Record<string, unknown>): Artifact {
    return {
      id: 'typescript/ts-probe',
      kind: 'rule',
      filePath: '/fake/ts-probe.rule.md',
      frontmatter: { id: 'typescript/ts-probe', kind: 'rule', title: 'Probe', ...frontmatter },
      body: 'body',
    } as Artifact;
  }

  it('flags severity explicitly set to the schema default (recommended)', () => {
    const catalog = makeCatalog([ruleArtifact({ severity: 'recommended' })]);
    const findings = runConformance(catalog, [], { ruleId: 'redundant-default' });
    assert.equal(findings.length, 1);
    assert.match(findings[0]!.detail, /key='severity'/);
  });

  it('does not flag severity set to a non-default value', () => {
    const catalog = makeCatalog([ruleArtifact({ severity: 'required' })]);
    const findings = runConformance(catalog, [], { ruleId: 'redundant-default' });
    assert.equal(findings.length, 0);
  });

  it('flags extends: [] as redundant', () => {
    const catalog = makeCatalog([ruleArtifact({ extends: [] })]);
    const findings = runConformance(catalog, [], { ruleId: 'redundant-default' });
    assert.equal(findings.length, 1);
    assert.match(findings[0]!.detail, /key='extends'/);
  });

  it('does not flag a non-empty extends array', () => {
    const catalog = makeCatalog([ruleArtifact({ extends: ['shared/clean-code'] })]);
    const findings = runConformance(catalog, [], { ruleId: 'redundant-default' });
    assert.equal(findings.length, 0);
  });

  it('produces one independently-fixable finding per redundant key on the same artifact', () => {
    // Regression guard for fix()'s key-identity comment: two redundant keys on one artifact
    // must resolve to two DISTINCT ArtifactEdits, not the same key fixed twice.
    const catalog = makeCatalog([ruleArtifact({ severity: 'recommended', extends: [] })]);
    const findings = runConformance(catalog, [], { ruleId: 'redundant-default' });
    assert.equal(findings.length, 2);
    const edits = findings.map(f => redundantDefaultRule.fix!(f, { catalog, targets: [] }));
    const patchedKeys = edits.map(e => Object.keys(e!.frontmatterPatch!)[0]).sort();
    assert.deepEqual(patchedKeys, ['extends', 'severity']);
  });

  it('does not flag appliesTo even when it equals the schema default ["**/*"]', () => {
    // Regression guard: appliesTo's presence vs. absence is behaviorally meaningful to
    // CLAUDE_SCAFFOLD_RULE_SPEC (an authored ["**/*"] still emits paths:, an omitted appliesTo
    // emits no frontmatter at all) even though both resolve to the same schema default VALUE.
    // The first version of this rule didn't know that and stripped it from 5 real catalog files
    // — caught by test/targets/claude-code.test.ts's scaffold test, not by this rule's own tests.
    const catalog = makeCatalog([ruleArtifact({ appliesTo: ['**/*'] })]);
    const findings = runConformance(catalog, [], { ruleId: 'redundant-default' });
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

  it('preserves untouched double-quoted frontmatter values (no full reserialize)', async () => {
    // Regression test: the editorial write path used to fully reserialize the frontmatter block
    // (same class of bug as the mechanical writer had), silently stripping intentional
    // double-quoting from every field the proposal never touched.
    fs.writeFileSync(
      filePath,
      '---\nid: csharp/cs-probe\nkind: rule\ntitle: "Probe (parens)"\n' +
        'description: "A probe rule: with a colon."\nappliesTo:\n  - "**/*.cs"\n---\n\nBody text.',
      'utf-8',
    );
    const { catalog, findings } = ruleFinding();
    const goodClient: EditorialModelClient = async () =>
      ({
        frontmatterPatch: { appliesToRationale: 'Scoped to C# project files only.' },
      }) as EditorialProposal;

    const results = await runEditorialFindings(findings, { catalog, targets: [] }, goodClient);

    assert.equal(results[0]!.status, 'written');
    const written = fs.readFileSync(filePath, 'utf-8');
    assert.match(written, /title: "Probe \(parens\)"/);
    assert.match(written, /description: "A probe rule: with a colon\."/);
    assert.match(written, /appliesToRationale: Scoped to C# project files only\./);
  });
});

describe('editorial pass — findings sharing one file do not race', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigil-editorial-race-'));
    filePath = path.join(tmpDir, 'SKILL.md');
    fs.writeFileSync(
      filePath,
      '---\nid: typescript/ts-probe\nkind: skill\ntitle: Probe\ndescription: A probe skill.\n' +
        'name: ts-probe\nlanguage: typescript\nwhenToUse: terse text\n---\n\nline 0\nline 1\nline 2',
      'utf-8',
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('applies two editorial findings on the same artifact without one clobbering the other', async () => {
    // Regression test: when-to-use-quality and body-density can both fire on one skill (this
    // happened for real on typescript/ts-release). Run concurrently, the second task's "before"
    // snapshot predates the first task's write, so its write silently erased the first task's
    // change. Tasks sharing a file must now be chained, not raced.
    const artifact: Artifact = {
      id: 'typescript/ts-probe',
      kind: 'skill',
      filePath,
      frontmatter: {
        id: 'typescript/ts-probe',
        kind: 'skill',
        title: 'Probe',
        description: 'A probe skill.',
        name: 'ts-probe',
        language: 'typescript',
        whenToUse: 'terse text',
      },
      body: 'line 0\nline 1\nline 2',
    };
    const catalog = makeCatalog([artifact]);
    const findings = [
      {
        ruleId: 'when-to-use-quality',
        severity: 'warning' as const,
        artifactId: 'typescript/ts-probe',
        filePath,
        detail: 'terse',
      },
      {
        ruleId: 'body-density',
        severity: 'warning' as const,
        artifactId: 'typescript/ts-probe',
        filePath,
        detail: 'long',
      },
    ];

    const modelClient: EditorialModelClient = async task => {
      if (task.ownedFields.includes('whenToUse')) {
        return { frontmatterPatch: { whenToUse: 'Use when probing things is requested.' } };
      }
      return { body: 'line 0\nline 1' };
    };

    const results = await runEditorialFindings(findings, { catalog, targets: [] }, modelClient);

    assert.equal(results.filter(r => r.status === 'written').length, 2);
    const written = fs.readFileSync(filePath, 'utf-8');
    assert.match(written, /whenToUse: Use when probing things is requested\./);
    assert.doesNotMatch(written, /whenToUse: terse text/);
    assert.match(written, /line 0\nline 1/);
    assert.doesNotMatch(written, /line 2/);
  });
});
