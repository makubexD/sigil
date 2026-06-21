/**
 * End-to-end pipeline tests.
 * Tests the full Load → Validate → Resolve → Emit cycle for both targets.
 *
 * Run: npm test   (after npm run build)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { loadCatalog } from '../dist-cli/load';
import { validateCatalog } from '../dist-cli/validate';
import { resolveCatalog } from '../dist-cli/resolve';
import { computeClosure, groupArtifactsByLanguage, availableKinds, buildLanguageOptions } from '../dist-cli/select';
import { ClaudeCodeTarget } from '../dist-cli/targets/claude-code';
import { CopilotTarget } from '../dist-cli/targets/copilot';
import { toClaudePlaceholders, toCopilotPlaceholders, buildArgumentHint } from '../dist-cli/targets/prompt-args';
import type { PromptArg } from '../dist-cli/targets/prompt-args';

const CATALOG_DIR = path.resolve(__dirname, '../catalog');
const VERSION = '0.1.0';
const PACKS = [
  { name: 'dotnet-pack', displayName: '.NET / C# Pack', description: 'C# skills and agents', languages: ['csharp'] },
  { name: 'python-pack', displayName: 'Python Pack', description: 'Python skills and agents', languages: ['python'] },
  { name: 'react-pack', displayName: 'React Pack', description: 'React skills and agents', languages: ['react'] },
];

// ─── Load ──────────────────────────────────────────────────────────────────────

describe('Load phase', () => {
  it('loads all expected artifacts', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);

    // Languages
    assert.ok(catalog.languages.has('csharp'), 'csharp language loaded');
    assert.ok(catalog.languages.has('python'), 'python language loaded');
    assert.ok(catalog.languages.has('react'), 'react language loaded');

    // Shared artifacts
    assert.ok(catalog.byId.has('shared/clean-code'), 'shared/clean-code rule exists');
    assert.ok(catalog.byId.has('shared/code-reviewer'), 'shared/code-reviewer agent exists');
    assert.ok(catalog.byId.has('shared/explain-diff'), 'shared/explain-diff prompt exists');

    // Language artifacts
    assert.ok(catalog.byId.has('csharp/dotnet-style'), 'csharp/dotnet-style rule exists');
    assert.ok(catalog.byId.has('csharp/xunit-testing'), 'csharp/xunit-testing skill exists');
    assert.ok(catalog.byId.has('csharp/dotnet-api-architect'), 'csharp/dotnet-api-architect agent exists');

    assert.ok(catalog.byId.has('python/python-style'), 'python/python-style rule exists');
    assert.ok(catalog.byId.has('python/pytest-testing'), 'python/pytest-testing skill exists');

    assert.ok(catalog.byId.has('react/react-style'), 'react/react-style rule exists');
    assert.ok(catalog.byId.has('react/component-testing'), 'react/component-testing skill exists');
  });

  it('loads skill reference files', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const skill = catalog.byId.get('csharp/xunit-testing');
    assert.ok(skill, 'skill exists');
    assert.ok(skill.references && skill.references.length > 0, 'skill has references');
    assert.equal(skill.references![0].name, 'assertions.md');
  });
});

// ─── Validate ─────────────────────────────────────────────────────────────────

describe('Validate phase', () => {
  it('passes with no errors on the seeded catalog', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const result = validateCatalog(catalog);

    if (!result.valid) {
      const msg = result.errors.map(e => `[${e.artifactId}] ${e.error}`).join('\n');
      assert.fail(`Validation failed:\n${msg}`);
    }

    assert.equal(result.errors.length, 0);
  });

  it('reports an error for a dangling extends reference', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);

    // Inject a fake artifact with a bad extends reference
    const fakeRule = {
      id: 'test/fake-rule',
      kind: 'rule' as const,
      filePath: '/fake/path.rule.md',
      frontmatter: {
        id: 'test/fake-rule',
        kind: 'rule',
        title: 'Fake Rule',
        description: 'A fake rule for testing.',
        extends: ['does-not/exist'],
        appliesTo: ['**/*'],
        severity: 'recommended',
      },
      body: '- Fake rule body.',
    };
    catalog.artifacts.push(fakeRule);
    catalog.byId.set(fakeRule.id, fakeRule);

    const result = validateCatalog(catalog);
    assert.ok(!result.valid, 'should be invalid');
    assert.ok(
      result.errors.some(e => e.error.includes("does-not/exist")),
      'error message mentions the missing id',
    );
  });

  it('detects cycles in extends', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);

    const ruleA = {
      id: 'test/cycle-a',
      kind: 'rule' as const,
      filePath: '/fake/cycle-a.rule.md',
      frontmatter: { id: 'test/cycle-a', kind: 'rule', title: 'A', description: 'A', extends: ['test/cycle-b'], appliesTo: ['**/*'], severity: 'recommended' },
      body: '- A',
    };
    const ruleB = {
      id: 'test/cycle-b',
      kind: 'rule' as const,
      filePath: '/fake/cycle-b.rule.md',
      frontmatter: { id: 'test/cycle-b', kind: 'rule', title: 'B', description: 'B', extends: ['test/cycle-a'], appliesTo: ['**/*'], severity: 'recommended' },
      body: '- B',
    };
    catalog.artifacts.push(ruleA, ruleB);
    catalog.byId.set(ruleA.id, ruleA);
    catalog.byId.set(ruleB.id, ruleB);

    const result = validateCatalog(catalog);
    assert.ok(!result.valid, 'should detect the cycle');
    assert.ok(
      result.errors.some(e => e.error.includes('Cycle')),
      'error mentions cycle',
    );
  });
});

// ─── Resolve ───────────────────────────────────────────────────────────────────

describe('Resolve phase', () => {
  it('flattens extends chains for rules', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const dotnetRule = resolved.byId.get('csharp/dotnet-style');
    assert.ok(dotnetRule, 'csharp/dotnet-style resolved');

    // resolvedBody should contain BOTH the parent (shared/clean-code) body
    // AND the csharp/dotnet-style body
    assert.ok(dotnetRule.resolvedBody?.includes('Clear names'), 'inherited clean-code guidance present');
    assert.ok(dotnetRule.resolvedBody?.includes('File-scoped namespaces'), 'own guidance present');
  });

  it('expands uses.rules for skills', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const skill = resolved.byId.get('csharp/xunit-testing');
    assert.ok(skill, 'csharp/xunit-testing resolved');
    assert.ok(skill.resolvedRules && skill.resolvedRules.length > 0, 'resolvedRules populated');
    assert.equal(skill.resolvedRules![0].id, 'csharp/dotnet-style');
  });

  it('expands uses.agents for skills', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const skill = resolved.byId.get('csharp/xunit-testing');
    assert.ok(skill?.resolvedAgentIds?.includes('shared/code-reviewer'), 'agent id recorded');
  });
});

// ─── computeClosure ────────────────────────────────────────────────────────────

describe('computeClosure', () => {
  it('identifies the primary artifact and its dependency closure', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const { primary, dependencies } = computeClosure(['csharp/xunit-testing'], resolved);

    // Primary
    assert.equal(primary.length, 1, 'one primary artifact');
    assert.equal(primary[0].id, 'csharp/xunit-testing');

    // Dependencies
    const depIds = dependencies.map(d => d.artifact.id);
    assert.ok(depIds.includes('csharp/dotnet-style'), 'dotnet-style rule is a dependency');
    assert.ok(depIds.includes('shared/code-reviewer'), 'code-reviewer agent is a dependency');

    // Rules come before agents in the dependency list
    const ruleIdx = depIds.indexOf('csharp/dotnet-style');
    const agentIdx = depIds.indexOf('shared/code-reviewer');
    assert.ok(ruleIdx < agentIdx, 'rules listed before agents');

    // via attribute names the skill that pulls each dep in
    const ruleDep = dependencies.find(d => d.artifact.id === 'csharp/dotnet-style');
    assert.ok(ruleDep?.via.includes('csharp/xunit-testing'), 'via references the source skill');
  });

  it('excludes directly-selected artifacts from the dependency list', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    // Selecting the rule AND the skill — the rule is a direct pick, not a dependency
    const { primary, dependencies } = computeClosure(
      ['csharp/xunit-testing', 'csharp/dotnet-style'],
      resolved,
    );

    assert.equal(primary.length, 2, 'two primary artifacts');
    const depIds = dependencies.map(d => d.artifact.id);
    assert.ok(!depIds.includes('csharp/dotnet-style'), 'directly-selected rule not in dependencies');
    assert.ok(depIds.includes('shared/code-reviewer'), 'agent is still a dependency');
  });

  it('returns empty dependencies when selection contains no skills', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const { primary, dependencies } = computeClosure(['shared/code-reviewer'], resolved);

    assert.equal(primary.length, 1, 'one primary artifact');
    assert.equal(dependencies.length, 0, 'no dependencies when primary has no skills');
  });

  it('returns empty dependencies when all closure artifacts are already primary picks', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    // Selecting skill + all its deps directly → no computed dependencies
    const { dependencies } = computeClosure(
      ['csharp/xunit-testing', 'csharp/dotnet-style', 'shared/code-reviewer'],
      resolved,
    );
    assert.equal(dependencies.length, 0, 'all closure members already in primary — no deps');
  });
});

// ─── groupArtifactsByLanguage ─────────────────────────────────────────────────

describe('groupArtifactsByLanguage', () => {
  it('buckets artifacts under their language, undefined-language under "shared"', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const groups = groupArtifactsByLanguage(resolved.artifacts);

    // "shared" must be present (shared/clean-code, shared/code-reviewer, etc.)
    assert.ok('shared' in groups, '"shared" group present for language-undefined artifacts');

    // At least one real language group
    const realLanguages = Object.keys(groups).filter(k => k !== 'shared');
    assert.ok(realLanguages.length > 0, 'at least one language group');

    // Every artifact in "shared" has no language frontmatter
    for (const a of groups['shared']) {
      const lang = a.frontmatter.language as string | undefined;
      assert.equal(lang, undefined, `shared artifact ${a.id} must have no language`);
    }

    // Every artifact in a real language group matches that group key
    for (const lang of realLanguages) {
      for (const a of groups[lang]) {
        assert.equal(
          a.frontmatter.language as string | undefined,
          lang,
          `artifact ${a.id} language frontmatter matches group key`,
        );
      }
    }
  });

  it('"shared" group is sorted last', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const groups = groupArtifactsByLanguage(resolved.artifacts);
    const keys = Object.keys(groups);

    assert.equal(keys[keys.length - 1], 'shared', '"shared" is the last group key');
  });

  it('within each group, artifacts are sorted by kind then id', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const groups = groupArtifactsByLanguage(resolved.artifacts);
    const kindOrder = ['skill', 'agent', 'rule', 'prompt', 'workflow'];

    for (const [groupKey, arts] of Object.entries(groups)) {
      for (let i = 1; i < arts.length; i++) {
        const prev = arts[i - 1];
        const curr = arts[i];
        const prevKi = kindOrder.indexOf(prev.kind);
        const currKi = kindOrder.indexOf(curr.kind);
        const ok =
          currKi > prevKi ||
          (currKi === prevKi && curr.id >= prev.id);
        assert.ok(
          ok,
          `In group "${groupKey}": ${prev.id} (${prev.kind}) should sort before ${curr.id} (${curr.kind})`,
        );
      }
    }
  });

  it('single-language filter includes that language + "shared", excludes others', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);

    const groups = groupArtifactsByLanguage(resolved.artifacts, 'csharp');
    const keys = Object.keys(groups);

    assert.ok('csharp' in groups, 'csharp group present');
    assert.ok('shared' in groups, '"shared" group present (always included)');

    // No other language groups
    const otherLangs = keys.filter(k => k !== 'csharp' && k !== 'shared');
    assert.equal(otherLangs.length, 0, `no other language groups: ${otherLangs.join(', ')}`);
  });
});

// ─── Claude Code emit ──────────────────────────────────────────────────────────

describe('Claude Code target', () => {
  it('emits marketplace.json with all packs (flat top-level schema)', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    assert.ok('.claude-plugin/marketplace.json' in files, 'marketplace.json emitted');
    const marketplace = JSON.parse(files['.claude-plugin/marketplace.json']);
    // Official schema is flat: name / owner / plugins[] at top level (no "marketplace" wrapper)
    // See: code.claude.com/docs/en/plugin-marketplaces
    assert.ok(!marketplace.marketplace, 'no nested "marketplace" key — must be flat');
    assert.equal(marketplace.name, 'maku-catalog', 'name at top level');
    assert.ok(marketplace.owner?.name, 'owner.name present');
    assert.equal(marketplace.plugins.length, 3, '3 plugin entries');
  });

  it('emits plugin.json with correct version for each pack', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    const pluginJson = JSON.parse(files['plugins/dotnet-pack/.claude-plugin/plugin.json']);
    assert.equal(pluginJson.version, VERSION, 'plugin version matches npm version');
    assert.equal(pluginJson.name, 'dotnet-pack');
  });

  it('emits a SKILL.md with the rule body inlined', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    const skillMd = files['plugins/dotnet-pack/skills/xunit-testing/SKILL.md'];
    assert.ok(skillMd, 'xunit-testing SKILL.md emitted');
    assert.ok(skillMd.includes('Writing xUnit Tests'), 'skill body present');
    assert.ok(skillMd.includes('Applied Rules'), 'rules section present');
    assert.ok(skillMd.includes('File-scoped namespaces'), 'dotnet-style rule inlined');
    // `paths:` is the Claude Code–recognized key; `appliesTo` is our vendor-neutral source name
    // See: code.claude.com/docs/en/skills
    assert.ok(skillMd.includes('paths:'), 'paths: field emitted (not appliesTo:)');
    assert.ok(!skillMd.includes('appliesTo:'), 'appliesTo not emitted in Claude output');
    // description must be safely quoted (not a bare plain scalar)
    assert.ok(skillMd.match(/description:\s*"/), 'description is a quoted YAML scalar');
  });

  it('emits the shared code-reviewer agent into each pack that uses it', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    assert.ok('plugins/dotnet-pack/agents/code-reviewer.md' in files, 'shared agent emitted into dotnet-pack');
  });

  it('scaffold: writes skill + closure into .claude/', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.scaffold!('csharp/xunit-testing', resolved, { projectDir: '/fake' });

    assert.ok('.claude/skills/xunit-testing/SKILL.md' in files, 'skill scaffolded');
    assert.ok('.claude/rules/csharp-dotnet-style.md' in files, 'rule scaffolded');
    assert.ok('.claude/agents/code-reviewer.md' in files, 'agent scaffolded');
  });

  it('scaffold: language-scoped rule has paths: frontmatter; shared rule does not', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.scaffold!('csharp/xunit-testing', resolved, { projectDir: '/fake' });

    const languageRule = files['.claude/rules/csharp-dotnet-style.md'];
    assert.ok(languageRule, 'csharp rule scaffolded');
    assert.ok(languageRule.includes('paths:'), 'language rule has paths: frontmatter');
    assert.ok(languageRule.includes('*.cs'), 'csharp glob present');

    // Scaffold shared rule directly and verify no frontmatter
    const sharedFiles = await target.scaffold!('shared/clean-code', resolved, { projectDir: '/fake' });
    const sharedRule = sharedFiles['.claude/rules/shared-clean-code.md'];
    assert.ok(sharedRule, 'shared rule scaffolded');
    assert.ok(!sharedRule.startsWith('---'), 'shared rule has no frontmatter (loaded unconditionally)');
  });
});

// ─── Copilot emit ──────────────────────────────────────────────────────────────

describe('Copilot target', () => {
  it('emits copilot-instructions.md from shared rules', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new CopilotTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    assert.ok('.github/copilot-instructions.md' in files, 'copilot-instructions.md emitted');
    const content = files['.github/copilot-instructions.md'];
    assert.ok(content.includes('Clean Code Baseline'), 'shared rule heading present');
    assert.ok(content.includes('Clear names'), 'rule body content present');
  });

  it('emits language-specific instructions with applyTo globs', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new CopilotTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    const instrFile = files['.github/instructions/csharp-dotnet-style.instructions.md'];
    assert.ok(instrFile, 'csharp instructions file emitted');
    assert.ok(instrFile.includes('applyTo'), 'applyTo frontmatter present');
    assert.ok(instrFile.includes('*.cs'), 'cs glob present');
    assert.ok(instrFile.includes('File-scoped namespaces'), 'rule body present');
  });

  it('emits skills as prompt files', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new CopilotTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    const promptFile = files['.github/prompts/xunit-testing.prompt.md'];
    assert.ok(promptFile, 'xunit-testing.prompt.md emitted');
    // `agent:` is the current field name (renamed from legacy `mode:`)
    // See: code.visualstudio.com/docs/agent-customization/prompt-files
    assert.ok(promptFile.includes('agent: agent'), 'agent field set (not legacy mode:)');
    assert.ok(!promptFile.includes('applyTo'), 'no applyTo in prompt files (belongs in .instructions.md only)');
    assert.ok(promptFile.includes('Writing xUnit Tests'), 'skill body present');
  });

  it('emits AGENTS.md with all agents', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new CopilotTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    assert.ok('.github/AGENTS.md' in files, 'AGENTS.md emitted');
    const content = files['.github/AGENTS.md'];
    assert.ok(content.includes('code-reviewer'), 'code-reviewer agent listed');
  });

  it('scaffold: agent emits .agent.md with required description frontmatter', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new CopilotTarget();
    const files = await target.scaffold!('shared/code-reviewer', resolved, { projectDir: '/fake' });

    // Official Copilot spec requires .agent.md extension and description frontmatter
    // See: docs.github.com/.../custom-agents-configuration
    assert.ok('.github/agents/code-reviewer.agent.md' in files, 'agent uses .agent.md extension');
    assert.ok(!('.github/agents/code-reviewer.md' in files), 'bare .md not emitted');
    const content = files['.github/agents/code-reviewer.agent.md'];
    assert.ok(content.startsWith('---'), 'agent file has YAML frontmatter');
    assert.ok(content.includes('description:'), 'description frontmatter present (required by spec)');
    assert.ok(content.match(/description:\s*"/), 'description is safely quoted');
  });
});

// ─── Part A: prompt-args helpers ───────────────────────────────────────────────

describe('toClaudePlaceholders', () => {
  it('translates {{name}} to $name', () => {
    assert.equal(toClaudePlaceholders('Give me {{diff}}'), 'Give me $diff');
  });

  it('translates multiple placeholders', () => {
    assert.equal(
      toClaudePlaceholders('Diff: {{diff}}\nAudience: {{audience}}'),
      'Diff: $diff\nAudience: $audience',
    );
  });

  it('tolerates inner whitespace ({{ diff }})', () => {
    assert.equal(toClaudePlaceholders('{{ diff }}'), '$diff');
  });

  it('leaves text with no placeholders unchanged', () => {
    const body = 'No substitution needed here.';
    assert.equal(toClaudePlaceholders(body), body);
  });
});

describe('toCopilotPlaceholders', () => {
  it('translates {{name}} to ${input:name}', () => {
    assert.equal(toCopilotPlaceholders('Give me {{diff}}'), 'Give me ${input:diff}');
  });

  it('translates multiple placeholders', () => {
    assert.equal(
      toCopilotPlaceholders('Diff: {{diff}}\nAudience: {{audience}}'),
      'Diff: ${input:diff}\nAudience: ${input:audience}',
    );
  });

  it('tolerates inner whitespace ({{ diff }})', () => {
    assert.equal(toCopilotPlaceholders('{{ diff }}'), '${input:diff}');
  });

  it('leaves text with no placeholders unchanged', () => {
    const body = 'No substitution needed here.';
    assert.equal(toCopilotPlaceholders(body), body);
  });
});

describe('buildArgumentHint', () => {
  it('formats required args as [name]', () => {
    const args: PromptArg[] = [{ name: 'diff', required: true }, { name: 'audience' }];
    assert.equal(buildArgumentHint(args), '[diff] [audience]');
  });

  it('returns empty string for no args', () => {
    assert.equal(buildArgumentHint([]), '');
  });

  it('single arg', () => {
    assert.equal(buildArgumentHint([{ name: 'file' }]), '[file]');
  });
});

describe('Claude scaffold: prompt with args', () => {
  it('emits description, argument-hint, arguments frontmatter and $name body', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.scaffold!('shared/explain-diff', resolved, { projectDir: '/fake' });

    const f = files['.claude/commands/shared-explain-diff.md'];
    assert.ok(f, 'command file emitted at .claude/commands/shared-explain-diff.md');
    assert.ok(f.startsWith('---'), 'command file starts with YAML frontmatter');
    assert.ok(f.includes('description:'), 'description field present');
    assert.ok(f.includes('argument-hint:'), 'argument-hint field present');
    assert.ok(f.includes('[diff]'), 'diff arg in argument-hint');
    assert.ok(f.includes('[audience]'), 'audience arg in argument-hint');
    assert.ok(f.includes('arguments:'), 'arguments list present');
    assert.ok(f.includes('  - diff'), 'diff in arguments list');
    assert.ok(f.includes('  - audience'), 'audience in arguments list');
    assert.ok(!f.includes('{{diff}}'), '{{diff}} placeholder translated');
    assert.ok(f.includes('$diff'), '$diff substitution present');
  });
});

describe('Copilot scaffold: prompt with args', () => {
  it('emits ${input:name} substitution in body', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new CopilotTarget();
    const files = await target.scaffold!('shared/explain-diff', resolved, { projectDir: '/fake' });

    const f = files['.github/prompts/shared-explain-diff.prompt.md'];
    assert.ok(f, 'prompt file emitted at .github/prompts/shared-explain-diff.prompt.md');
    assert.ok(f.includes('agent: agent'), 'agent: agent frontmatter present');
    assert.ok(f.includes('description:'), 'description frontmatter present');
    assert.ok(!f.includes('{{diff}}'), '{{diff}} placeholder translated');
    assert.ok(f.includes('${input:diff}'), '${input:diff} substitution present');
  });

  it('regression: skill-derived prompt file is unaffected (no {{}} tokens)', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new CopilotTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    const f = files['.github/prompts/xunit-testing.prompt.md'];
    assert.ok(f, 'xunit-testing prompt file still emitted');
    assert.ok(f.includes('agent: agent'), 'agent field still present');
    assert.ok(f.includes('Writing xUnit Tests'), 'skill body still present');
    assert.ok(!f.includes('{{'), 'no unresolved {{ placeholders in skill prompt');
  });
});

// ─── Part B: availability helpers ──────────────────────────────────────────────

describe('availableKinds', () => {
  it('returns present kinds in KIND_ORDER', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const kinds = availableKinds(resolved.artifacts);
    // Must be a subset of KIND_ORDER — skill comes before agent, etc.
    const kindOrder = ['skill', 'agent', 'rule', 'prompt', 'workflow'];
    for (let i = 0; i < kinds.length - 1; i++) {
      assert.ok(
        kindOrder.indexOf(kinds[i]) < kindOrder.indexOf(kinds[i + 1]),
        `kind order: ${kinds[i]} should precede ${kinds[i + 1]}`,
      );
    }
  });

  it('excludes kinds not present in the artifact list', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    // Skills only
    const skillsOnly = resolved.artifacts.filter(a => a.kind === 'skill');
    const kinds = availableKinds(skillsOnly);
    assert.deepEqual(kinds, ['skill'], 'only skill kind present');
  });

  it('returns empty array for empty list', () => {
    assert.deepEqual(availableKinds([]), []);
  });
});

describe('buildLanguageOptions (array-based)', () => {
  it('returns [] when no language-tagged artifacts', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const sharedOnly = resolved.artifacts.filter(a => !a.frontmatter.language);
    assert.deepEqual(buildLanguageOptions(sharedOnly), []);
  });

  it('includes All languages option + one per language with count', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const opts = buildLanguageOptions(resolved.artifacts);
    assert.ok(opts.length >= 2, 'at least All + 1 language');
    assert.equal(opts[0].value, '', 'first option is All languages');
    assert.ok(opts.slice(1).every(o => o.hint.match(/\d+ artifact/)), 'each language has count hint');
  });

  it('counts reflect the passed subset, not the whole catalog', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    // Only csharp artifacts
    const csharpOnly = resolved.artifacts.filter(a => a.frontmatter.language === 'csharp');
    const opts = buildLanguageOptions(csharpOnly);
    // Only csharp should appear (no python, react)
    const langs = opts.slice(1).map(o => o.value);
    assert.ok(langs.every(l => l === 'csharp'), 'only csharp in subset options');
    // Count in hint matches actual csharp artifacts
    const csharpOpt = opts.find(o => o.value === 'csharp');
    assert.ok(csharpOpt?.hint.startsWith(`${csharpOnly.length} artifact`), 'count matches subset');
  });
});
