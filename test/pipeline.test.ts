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
import { ClaudeCodeTarget } from '../dist-cli/targets/claude-code';
import { CopilotTarget } from '../dist-cli/targets/copilot';

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

// ─── Claude Code emit ──────────────────────────────────────────────────────────

describe('Claude Code target', () => {
  it('emits marketplace.json with all packs', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    assert.ok('.claude-plugin/marketplace.json' in files, 'marketplace.json emitted');
    const marketplace = JSON.parse(files['.claude-plugin/marketplace.json']);
    assert.equal(marketplace.marketplace.version, VERSION);
    assert.equal(marketplace.marketplace.plugins.length, 3);
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
    assert.ok(promptFile.includes('mode: agent'), 'agent mode set');
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
});
