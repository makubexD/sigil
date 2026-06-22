"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * End-to-end pipeline tests.
 * Tests the full Load → Validate → Resolve → Emit cycle for both targets.
 *
 * Run: npm test   (after npm run build)
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const path_1 = __importDefault(require("path"));
const load_1 = require("../dist-cli/load");
const validate_1 = require("../dist-cli/validate");
const resolve_1 = require("../dist-cli/resolve");
const select_1 = require("../dist-cli/select");
const claude_code_1 = require("../dist-cli/targets/claude-code");
const copilot_1 = require("../dist-cli/targets/copilot");
const prompt_args_1 = require("../dist-cli/targets/prompt-args");
const output_contract_1 = require("../dist-cli/targets/output-contract");
const select_2 = require("../dist-cli/select");
const platforms_1 = require("../dist-cli/authoring/platforms");
const check_source_1 = require("../dist-cli/authoring/check-source");
const header_1 = require("../dist-cli/authoring/header");
const wizard_1 = require("../dist-cli/wizard");
const targets_1 = require("../dist-cli/targets");
const CATALOG_DIR = path_1.default.resolve(__dirname, '../catalog');
const VERSION = '0.1.0';
const PACKS = [
    { name: 'dotnet-pack', displayName: '.NET / C# Pack', description: 'C# skills and agents', languages: ['csharp'] },
    { name: 'python-pack', displayName: 'Python Pack', description: 'Python skills and agents', languages: ['python'] },
    { name: 'react-pack', displayName: 'React Pack', description: 'React skills and agents', languages: ['react'] },
];
// ─── Load ──────────────────────────────────────────────────────────────────────
(0, node_test_1.describe)('Load phase', () => {
    (0, node_test_1.it)('loads all expected artifacts', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        // Languages
        strict_1.default.ok(catalog.languages.has('csharp'), 'csharp language loaded');
        strict_1.default.ok(catalog.languages.has('python'), 'python language loaded');
        strict_1.default.ok(catalog.languages.has('react'), 'react language loaded');
        // Shared artifacts
        strict_1.default.ok(catalog.byId.has('shared/clean-code'), 'shared/clean-code rule exists');
        strict_1.default.ok(catalog.byId.has('shared/code-reviewer'), 'shared/code-reviewer agent exists');
        strict_1.default.ok(catalog.byId.has('shared/explain-diff'), 'shared/explain-diff prompt exists');
        // Language artifacts
        strict_1.default.ok(catalog.byId.has('csharp/dotnet-style'), 'csharp/dotnet-style rule exists');
        strict_1.default.ok(catalog.byId.has('csharp/xunit-testing'), 'csharp/xunit-testing skill exists');
        strict_1.default.ok(catalog.byId.has('csharp/dotnet-api-architect'), 'csharp/dotnet-api-architect agent exists');
        strict_1.default.ok(catalog.byId.has('python/python-style'), 'python/python-style rule exists');
        strict_1.default.ok(catalog.byId.has('python/pytest-testing'), 'python/pytest-testing skill exists');
        strict_1.default.ok(catalog.byId.has('react/react-style'), 'react/react-style rule exists');
        strict_1.default.ok(catalog.byId.has('react/component-testing'), 'react/component-testing skill exists');
    });
    (0, node_test_1.it)('loads skill reference files', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const skill = catalog.byId.get('csharp/xunit-testing');
        strict_1.default.ok(skill, 'skill exists');
        strict_1.default.ok(skill.references && skill.references.length > 0, 'skill has references');
        strict_1.default.equal(skill.references[0].name, 'assertions.md');
    });
});
// ─── Validate ─────────────────────────────────────────────────────────────────
(0, node_test_1.describe)('Validate phase', () => {
    (0, node_test_1.it)('passes with no errors on the seeded catalog', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const result = (0, validate_1.validateCatalog)(catalog);
        if (!result.valid) {
            const msg = result.errors.map(e => `[${e.artifactId}] ${e.error}`).join('\n');
            strict_1.default.fail(`Validation failed:\n${msg}`);
        }
        strict_1.default.equal(result.errors.length, 0);
    });
    (0, node_test_1.it)('reports an error for a dangling extends reference', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        // Inject a fake artifact with a bad extends reference
        const fakeRule = {
            id: 'test/fake-rule',
            kind: 'rule',
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
        const result = (0, validate_1.validateCatalog)(catalog);
        strict_1.default.ok(!result.valid, 'should be invalid');
        strict_1.default.ok(result.errors.some(e => e.error.includes("does-not/exist")), 'error message mentions the missing id');
    });
    (0, node_test_1.it)('detects cycles in extends', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const ruleA = {
            id: 'test/cycle-a',
            kind: 'rule',
            filePath: '/fake/cycle-a.rule.md',
            frontmatter: { id: 'test/cycle-a', kind: 'rule', title: 'A', description: 'A', extends: ['test/cycle-b'], appliesTo: ['**/*'], severity: 'recommended' },
            body: '- A',
        };
        const ruleB = {
            id: 'test/cycle-b',
            kind: 'rule',
            filePath: '/fake/cycle-b.rule.md',
            frontmatter: { id: 'test/cycle-b', kind: 'rule', title: 'B', description: 'B', extends: ['test/cycle-a'], appliesTo: ['**/*'], severity: 'recommended' },
            body: '- B',
        };
        catalog.artifacts.push(ruleA, ruleB);
        catalog.byId.set(ruleA.id, ruleA);
        catalog.byId.set(ruleB.id, ruleB);
        const result = (0, validate_1.validateCatalog)(catalog);
        strict_1.default.ok(!result.valid, 'should detect the cycle');
        strict_1.default.ok(result.errors.some(e => e.error.includes('Cycle')), 'error mentions cycle');
    });
});
// ─── Resolve ───────────────────────────────────────────────────────────────────
(0, node_test_1.describe)('Resolve phase', () => {
    (0, node_test_1.it)('flattens extends chains for rules', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const dotnetRule = resolved.byId.get('csharp/dotnet-style');
        strict_1.default.ok(dotnetRule, 'csharp/dotnet-style resolved');
        // resolvedBody should contain BOTH the parent (shared/clean-code) body
        // AND the csharp/dotnet-style body
        strict_1.default.ok(dotnetRule.resolvedBody?.includes('Clear names'), 'inherited clean-code guidance present');
        strict_1.default.ok(dotnetRule.resolvedBody?.includes('File-scoped namespaces'), 'own guidance present');
    });
    (0, node_test_1.it)('expands uses.rules for skills', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const skill = resolved.byId.get('csharp/xunit-testing');
        strict_1.default.ok(skill, 'csharp/xunit-testing resolved');
        strict_1.default.ok(skill.resolvedRules && skill.resolvedRules.length > 0, 'resolvedRules populated');
        strict_1.default.equal(skill.resolvedRules[0].id, 'csharp/dotnet-style');
    });
    (0, node_test_1.it)('expands uses.agents for skills', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const skill = resolved.byId.get('csharp/xunit-testing');
        strict_1.default.ok(skill?.resolvedAgentIds?.includes('shared/code-reviewer'), 'agent id recorded');
    });
});
// ─── computeClosure ────────────────────────────────────────────────────────────
(0, node_test_1.describe)('computeClosure', () => {
    (0, node_test_1.it)('identifies the primary artifact and its dependency closure', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const { primary, dependencies } = (0, select_1.computeClosure)(['csharp/xunit-testing'], resolved);
        // Primary
        strict_1.default.equal(primary.length, 1, 'one primary artifact');
        strict_1.default.equal(primary[0].id, 'csharp/xunit-testing');
        // Dependencies
        const depIds = dependencies.map(d => d.artifact.id);
        strict_1.default.ok(depIds.includes('csharp/dotnet-style'), 'dotnet-style rule is a dependency');
        strict_1.default.ok(depIds.includes('shared/code-reviewer'), 'code-reviewer agent is a dependency');
        // Rules come before agents in the dependency list
        const ruleIdx = depIds.indexOf('csharp/dotnet-style');
        const agentIdx = depIds.indexOf('shared/code-reviewer');
        strict_1.default.ok(ruleIdx < agentIdx, 'rules listed before agents');
        // via attribute names the skill that pulls each dep in
        const ruleDep = dependencies.find(d => d.artifact.id === 'csharp/dotnet-style');
        strict_1.default.ok(ruleDep?.via.includes('csharp/xunit-testing'), 'via references the source skill');
    });
    (0, node_test_1.it)('excludes directly-selected artifacts from the dependency list', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        // Selecting the rule AND the skill — the rule is a direct pick, not a dependency
        const { primary, dependencies } = (0, select_1.computeClosure)(['csharp/xunit-testing', 'csharp/dotnet-style'], resolved);
        strict_1.default.equal(primary.length, 2, 'two primary artifacts');
        const depIds = dependencies.map(d => d.artifact.id);
        strict_1.default.ok(!depIds.includes('csharp/dotnet-style'), 'directly-selected rule not in dependencies');
        strict_1.default.ok(depIds.includes('shared/code-reviewer'), 'agent is still a dependency');
    });
    (0, node_test_1.it)('returns empty dependencies when selection contains no skills', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const { primary, dependencies } = (0, select_1.computeClosure)(['shared/code-reviewer'], resolved);
        strict_1.default.equal(primary.length, 1, 'one primary artifact');
        strict_1.default.equal(dependencies.length, 0, 'no dependencies when primary has no skills');
    });
    (0, node_test_1.it)('returns empty dependencies when all closure artifacts are already primary picks', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        // Selecting skill + all its deps directly → no computed dependencies
        const { dependencies } = (0, select_1.computeClosure)(['csharp/xunit-testing', 'csharp/dotnet-style', 'shared/code-reviewer'], resolved);
        strict_1.default.equal(dependencies.length, 0, 'all closure members already in primary — no deps');
    });
});
// ─── groupArtifactsByLanguage ─────────────────────────────────────────────────
(0, node_test_1.describe)('groupArtifactsByLanguage', () => {
    (0, node_test_1.it)('buckets artifacts under their language, undefined-language under "shared"', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const groups = (0, select_1.groupArtifactsByLanguage)(resolved.artifacts);
        // "shared" must be present (shared/clean-code, shared/code-reviewer, etc.)
        strict_1.default.ok('shared' in groups, '"shared" group present for language-undefined artifacts');
        // At least one real language group
        const realLanguages = Object.keys(groups).filter(k => k !== 'shared');
        strict_1.default.ok(realLanguages.length > 0, 'at least one language group');
        // Every artifact in "shared" has no language frontmatter
        for (const a of groups['shared']) {
            const lang = a.frontmatter.language;
            strict_1.default.equal(lang, undefined, `shared artifact ${a.id} must have no language`);
        }
        // Every artifact in a real language group matches that group key
        for (const lang of realLanguages) {
            for (const a of groups[lang]) {
                strict_1.default.equal(a.frontmatter.language, lang, `artifact ${a.id} language frontmatter matches group key`);
            }
        }
    });
    (0, node_test_1.it)('"shared" group is sorted last', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const groups = (0, select_1.groupArtifactsByLanguage)(resolved.artifacts);
        const keys = Object.keys(groups);
        strict_1.default.equal(keys[keys.length - 1], 'shared', '"shared" is the last group key');
    });
    (0, node_test_1.it)('within each group, artifacts are sorted by kind then id', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const groups = (0, select_1.groupArtifactsByLanguage)(resolved.artifacts);
        const kindOrder = ['skill', 'agent', 'rule', 'prompt', 'workflow'];
        for (const [groupKey, arts] of Object.entries(groups)) {
            for (let i = 1; i < arts.length; i++) {
                const prev = arts[i - 1];
                const curr = arts[i];
                const prevKi = kindOrder.indexOf(prev.kind);
                const currKi = kindOrder.indexOf(curr.kind);
                const ok = currKi > prevKi ||
                    (currKi === prevKi && curr.id >= prev.id);
                strict_1.default.ok(ok, `In group "${groupKey}": ${prev.id} (${prev.kind}) should sort before ${curr.id} (${curr.kind})`);
            }
        }
    });
    (0, node_test_1.it)('single-language filter includes that language + "shared", excludes others', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const groups = (0, select_1.groupArtifactsByLanguage)(resolved.artifacts, 'csharp');
        const keys = Object.keys(groups);
        strict_1.default.ok('csharp' in groups, 'csharp group present');
        strict_1.default.ok('shared' in groups, '"shared" group present (always included)');
        // No other language groups
        const otherLangs = keys.filter(k => k !== 'csharp' && k !== 'shared');
        strict_1.default.equal(otherLangs.length, 0, `no other language groups: ${otherLangs.join(', ')}`);
    });
});
// ─── Claude Code emit ──────────────────────────────────────────────────────────
(0, node_test_1.describe)('Claude Code target', () => {
    (0, node_test_1.it)('emits marketplace.json with all packs (flat top-level schema)', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new claude_code_1.ClaudeCodeTarget();
        const files = await target.compile(resolved, { version: VERSION, packs: PACKS });
        strict_1.default.ok('.claude-plugin/marketplace.json' in files, 'marketplace.json emitted');
        const marketplace = JSON.parse(files['.claude-plugin/marketplace.json']);
        // Official schema is flat: name / owner / plugins[] at top level (no "marketplace" wrapper)
        // See: code.claude.com/docs/en/plugin-marketplaces
        strict_1.default.ok(!marketplace.marketplace, 'no nested "marketplace" key — must be flat');
        strict_1.default.equal(marketplace.name, 'maku-catalog', 'name at top level');
        strict_1.default.ok(marketplace.owner?.name, 'owner.name present');
        strict_1.default.equal(marketplace.plugins.length, 3, '3 plugin entries');
    });
    (0, node_test_1.it)('emits plugin.json with correct version for each pack', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new claude_code_1.ClaudeCodeTarget();
        const files = await target.compile(resolved, { version: VERSION, packs: PACKS });
        const pluginJson = JSON.parse(files['plugins/dotnet-pack/.claude-plugin/plugin.json']);
        strict_1.default.equal(pluginJson.version, VERSION, 'plugin version matches npm version');
        strict_1.default.equal(pluginJson.name, 'dotnet-pack');
    });
    (0, node_test_1.it)('emits a SKILL.md with the rule body inlined', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new claude_code_1.ClaudeCodeTarget();
        const files = await target.compile(resolved, { version: VERSION, packs: PACKS });
        const skillMd = files['plugins/dotnet-pack/skills/xunit-testing/SKILL.md'];
        strict_1.default.ok(skillMd, 'xunit-testing SKILL.md emitted');
        strict_1.default.ok(skillMd.includes('Writing xUnit Tests'), 'skill body present');
        strict_1.default.ok(skillMd.includes('Applied Rules'), 'rules section present');
        strict_1.default.ok(skillMd.includes('File-scoped namespaces'), 'dotnet-style rule inlined');
        // `paths:` is the Claude Code–recognized key; `appliesTo` is our vendor-neutral source name
        // See: code.claude.com/docs/en/skills
        strict_1.default.ok(skillMd.includes('paths:'), 'paths: field emitted (not appliesTo:)');
        strict_1.default.ok(!skillMd.includes('appliesTo:'), 'appliesTo not emitted in Claude output');
        // description must be safely quoted (not a bare plain scalar)
        strict_1.default.ok(skillMd.match(/description:\s*"/), 'description is a quoted YAML scalar');
    });
    (0, node_test_1.it)('emits the shared code-reviewer agent into each pack that uses it', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new claude_code_1.ClaudeCodeTarget();
        const files = await target.compile(resolved, { version: VERSION, packs: PACKS });
        strict_1.default.ok('plugins/dotnet-pack/agents/code-reviewer.md' in files, 'shared agent emitted into dotnet-pack');
    });
    (0, node_test_1.it)('scaffold: writes skill + closure into .claude/', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new claude_code_1.ClaudeCodeTarget();
        const files = await target.scaffold('csharp/xunit-testing', resolved, { projectDir: '/fake' });
        strict_1.default.ok('.claude/skills/xunit-testing/SKILL.md' in files, 'skill scaffolded');
        strict_1.default.ok('.claude/rules/csharp-dotnet-style.md' in files, 'rule scaffolded');
        strict_1.default.ok('.claude/agents/code-reviewer.md' in files, 'agent scaffolded');
    });
    (0, node_test_1.it)('scaffold: language-scoped rule has paths: frontmatter; shared rule does not', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new claude_code_1.ClaudeCodeTarget();
        const files = await target.scaffold('csharp/xunit-testing', resolved, { projectDir: '/fake' });
        const languageRule = files['.claude/rules/csharp-dotnet-style.md'];
        strict_1.default.ok(languageRule, 'csharp rule scaffolded');
        strict_1.default.ok(languageRule.includes('paths:'), 'language rule has paths: frontmatter');
        strict_1.default.ok(languageRule.includes('*.cs'), 'csharp glob present');
        // Scaffold shared rule directly and verify no frontmatter
        const sharedFiles = await target.scaffold('shared/clean-code', resolved, { projectDir: '/fake' });
        const sharedRule = sharedFiles['.claude/rules/shared-clean-code.md'];
        strict_1.default.ok(sharedRule, 'shared rule scaffolded');
        strict_1.default.ok(!sharedRule.startsWith('---'), 'shared rule has no frontmatter (loaded unconditionally)');
    });
});
// ─── Copilot emit ──────────────────────────────────────────────────────────────
(0, node_test_1.describe)('Copilot target', () => {
    (0, node_test_1.it)('emits copilot-instructions.md from shared rules', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new copilot_1.CopilotTarget();
        const files = await target.compile(resolved, { version: VERSION, packs: PACKS });
        strict_1.default.ok('.github/copilot-instructions.md' in files, 'copilot-instructions.md emitted');
        const content = files['.github/copilot-instructions.md'];
        strict_1.default.ok(content.includes('Clean Code Baseline'), 'shared rule heading present');
        strict_1.default.ok(content.includes('Clear names'), 'rule body content present');
    });
    (0, node_test_1.it)('emits language-specific instructions with applyTo globs', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new copilot_1.CopilotTarget();
        const files = await target.compile(resolved, { version: VERSION, packs: PACKS });
        const instrFile = files['.github/instructions/csharp-dotnet-style.instructions.md'];
        strict_1.default.ok(instrFile, 'csharp instructions file emitted');
        strict_1.default.ok(instrFile.includes('applyTo'), 'applyTo frontmatter present');
        strict_1.default.ok(instrFile.includes('*.cs'), 'cs glob present');
        strict_1.default.ok(instrFile.includes('File-scoped namespaces'), 'rule body present');
    });
    (0, node_test_1.it)('emits skills as native Agent Skills (open standard)', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new copilot_1.CopilotTarget();
        const files = await target.compile(resolved, { version: VERSION, packs: PACKS });
        // Skills must now emit as native Agent Skills at .github/skills/<name>/SKILL.md
        // (Copilot Agent Skills open standard, agentskills.io) — NOT as prompt files.
        const skillMd = files['.github/skills/xunit-testing/SKILL.md'];
        strict_1.default.ok(skillMd, '.github/skills/xunit-testing/SKILL.md emitted');
        strict_1.default.ok(skillMd.includes('name: xunit-testing'), 'name frontmatter present');
        strict_1.default.ok(skillMd.includes('description:'), 'description frontmatter present');
        strict_1.default.ok(skillMd.includes('Writing xUnit Tests'), 'skill body present');
        // Agent Skill frontmatter must NOT include applyTo or paths — skills load by description relevance
        strict_1.default.ok(!skillMd.includes('applyTo'), 'no applyTo in SKILL.md (path-matching belongs in instructions)');
        strict_1.default.ok(!skillMd.includes('paths:'), 'no paths: in SKILL.md');
        // Supporting files (references) must be written alongside SKILL.md
        const assertionsRef = files['.github/skills/xunit-testing/references/assertions.md'];
        strict_1.default.ok(assertionsRef, 'references/assertions.md emitted alongside SKILL.md (bug-fix: was silently dropped)');
        // No prompt file should be emitted for a skill
        strict_1.default.ok(!('.github/prompts/xunit-testing.prompt.md' in files), 'skills must NOT emit as .prompt.md (skills and prompts are distinct Copilot artifact types)');
    });
    (0, node_test_1.it)('emits AGENTS.md with all agents', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new copilot_1.CopilotTarget();
        const files = await target.compile(resolved, { version: VERSION, packs: PACKS });
        strict_1.default.ok('.github/AGENTS.md' in files, 'AGENTS.md emitted');
        const content = files['.github/AGENTS.md'];
        strict_1.default.ok(content.includes('code-reviewer'), 'code-reviewer agent listed');
    });
    (0, node_test_1.it)('scaffold: agent emits .agent.md with required description frontmatter', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new copilot_1.CopilotTarget();
        const files = await target.scaffold('shared/code-reviewer', resolved, { projectDir: '/fake' });
        // Official Copilot spec requires .agent.md extension and description frontmatter
        // See: docs.github.com/.../custom-agents-configuration
        strict_1.default.ok('.github/agents/code-reviewer.agent.md' in files, 'agent uses .agent.md extension');
        strict_1.default.ok(!('.github/agents/code-reviewer.md' in files), 'bare .md not emitted');
        const content = files['.github/agents/code-reviewer.agent.md'];
        strict_1.default.ok(content.startsWith('---'), 'agent file has YAML frontmatter');
        strict_1.default.ok(content.includes('description:'), 'description frontmatter present (required by spec)');
        strict_1.default.ok(content.match(/description:\s*"/), 'description is safely quoted');
    });
});
// ─── Part A: prompt-args helpers ───────────────────────────────────────────────
(0, node_test_1.describe)('toClaudePlaceholders', () => {
    (0, node_test_1.it)('translates {{name}} to $name', () => {
        strict_1.default.equal((0, prompt_args_1.toClaudePlaceholders)('Give me {{diff}}'), 'Give me $diff');
    });
    (0, node_test_1.it)('translates multiple placeholders', () => {
        strict_1.default.equal((0, prompt_args_1.toClaudePlaceholders)('Diff: {{diff}}\nAudience: {{audience}}'), 'Diff: $diff\nAudience: $audience');
    });
    (0, node_test_1.it)('tolerates inner whitespace ({{ diff }})', () => {
        strict_1.default.equal((0, prompt_args_1.toClaudePlaceholders)('{{ diff }}'), '$diff');
    });
    (0, node_test_1.it)('leaves text with no placeholders unchanged', () => {
        const body = 'No substitution needed here.';
        strict_1.default.equal((0, prompt_args_1.toClaudePlaceholders)(body), body);
    });
});
(0, node_test_1.describe)('toCopilotPlaceholders', () => {
    (0, node_test_1.it)('translates {{name}} to ${input:name}', () => {
        strict_1.default.equal((0, prompt_args_1.toCopilotPlaceholders)('Give me {{diff}}'), 'Give me ${input:diff}');
    });
    (0, node_test_1.it)('translates multiple placeholders', () => {
        strict_1.default.equal((0, prompt_args_1.toCopilotPlaceholders)('Diff: {{diff}}\nAudience: {{audience}}'), 'Diff: ${input:diff}\nAudience: ${input:audience}');
    });
    (0, node_test_1.it)('tolerates inner whitespace ({{ diff }})', () => {
        strict_1.default.equal((0, prompt_args_1.toCopilotPlaceholders)('{{ diff }}'), '${input:diff}');
    });
    (0, node_test_1.it)('leaves text with no placeholders unchanged', () => {
        const body = 'No substitution needed here.';
        strict_1.default.equal((0, prompt_args_1.toCopilotPlaceholders)(body), body);
    });
});
(0, node_test_1.describe)('buildArgumentHint', () => {
    (0, node_test_1.it)('formats required args as [name]', () => {
        const args = [{ name: 'diff', required: true }, { name: 'audience' }];
        strict_1.default.equal((0, prompt_args_1.buildArgumentHint)(args), '[diff] [audience]');
    });
    (0, node_test_1.it)('returns empty string for no args', () => {
        strict_1.default.equal((0, prompt_args_1.buildArgumentHint)([]), '');
    });
    (0, node_test_1.it)('single arg', () => {
        strict_1.default.equal((0, prompt_args_1.buildArgumentHint)([{ name: 'file' }]), '[file]');
    });
});
(0, node_test_1.describe)('Claude scaffold: prompt with args', () => {
    (0, node_test_1.it)('emits description, argument-hint, arguments frontmatter and $name body', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new claude_code_1.ClaudeCodeTarget();
        const files = await target.scaffold('shared/explain-diff', resolved, { projectDir: '/fake' });
        const f = files['.claude/commands/shared-explain-diff.md'];
        strict_1.default.ok(f, 'command file emitted at .claude/commands/shared-explain-diff.md');
        strict_1.default.ok(f.startsWith('---'), 'command file starts with YAML frontmatter');
        strict_1.default.ok(f.includes('description:'), 'description field present');
        strict_1.default.ok(f.includes('argument-hint:'), 'argument-hint field present');
        strict_1.default.ok(f.includes('[diff]'), 'diff arg in argument-hint');
        strict_1.default.ok(f.includes('[audience]'), 'audience arg in argument-hint');
        strict_1.default.ok(f.includes('arguments:'), 'arguments list present');
        strict_1.default.ok(f.includes('  - diff'), 'diff in arguments list');
        strict_1.default.ok(f.includes('  - audience'), 'audience in arguments list');
        strict_1.default.ok(!f.includes('{{diff}}'), '{{diff}} placeholder translated');
        strict_1.default.ok(f.includes('$diff'), '$diff substitution present');
    });
});
(0, node_test_1.describe)('Copilot scaffold: prompt with args', () => {
    (0, node_test_1.it)('emits ${input:name} substitution in body', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new copilot_1.CopilotTarget();
        const files = await target.scaffold('shared/explain-diff', resolved, { projectDir: '/fake' });
        const f = files['.github/prompts/shared-explain-diff.prompt.md'];
        strict_1.default.ok(f, 'prompt file emitted at .github/prompts/shared-explain-diff.prompt.md');
        strict_1.default.ok(f.includes('agent: agent'), 'agent: agent frontmatter present');
        strict_1.default.ok(f.includes('description:'), 'description frontmatter present');
        strict_1.default.ok(!f.includes('{{diff}}'), '{{diff}} placeholder translated');
        strict_1.default.ok(f.includes('${input:diff}'), '${input:diff} substitution present');
    });
    (0, node_test_1.it)('regression: .github/prompts/ contains only standalone prompts (not skills)', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new copilot_1.CopilotTarget();
        const files = await target.compile(resolved, { version: VERSION, packs: PACKS });
        // Verify the per-AI artifact separation: prompts/ must only contain catalog `prompt` kinds,
        // never catalog `skill` kinds (those belong in skills/).
        const promptKeys = Object.keys(files).filter(k => k.startsWith('.github/prompts/'));
        const skillKeys = Object.keys(files).filter(k => k.startsWith('.github/skills/'));
        // The standalone explain-diff prompt must appear in prompts/
        strict_1.default.ok(promptKeys.some(k => k.includes('shared-explain-diff')), 'standalone prompt emitted to .github/prompts/');
        // No skill names should leak into prompts/
        strict_1.default.ok(!promptKeys.some(k => k.includes('xunit-testing')), 'xunit-testing (a skill) must NOT appear in .github/prompts/');
        strict_1.default.ok(!promptKeys.some(k => k.includes('pytest-testing')), 'pytest-testing (a skill) must NOT appear in .github/prompts/');
        // Skills must appear in skills/ with no unresolved {{ placeholders
        strict_1.default.ok(skillKeys.some(k => k.endsWith('/SKILL.md')), 'at least one SKILL.md emitted under .github/skills/');
        skillKeys
            .filter(k => k.endsWith('/SKILL.md'))
            .forEach(k => {
            strict_1.default.ok(!files[k].includes('{{'), `no unresolved {{ placeholders in ${k}`);
        });
    });
});
// ─── Part B: availability helpers ──────────────────────────────────────────────
(0, node_test_1.describe)('availableKinds', () => {
    (0, node_test_1.it)('returns present kinds in KIND_ORDER', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const kinds = (0, select_1.availableKinds)(resolved.artifacts);
        // Must be a subset of KIND_ORDER — skill comes before agent, etc.
        const kindOrder = ['skill', 'agent', 'rule', 'prompt', 'workflow'];
        for (let i = 0; i < kinds.length - 1; i++) {
            strict_1.default.ok(kindOrder.indexOf(kinds[i]) < kindOrder.indexOf(kinds[i + 1]), `kind order: ${kinds[i]} should precede ${kinds[i + 1]}`);
        }
    });
    (0, node_test_1.it)('excludes kinds not present in the artifact list', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        // Skills only
        const skillsOnly = resolved.artifacts.filter(a => a.kind === 'skill');
        const kinds = (0, select_1.availableKinds)(skillsOnly);
        strict_1.default.deepEqual(kinds, ['skill'], 'only skill kind present');
    });
    (0, node_test_1.it)('returns empty array for empty list', () => {
        strict_1.default.deepEqual((0, select_1.availableKinds)([]), []);
    });
});
(0, node_test_1.describe)('buildLanguageOptions (array-based)', () => {
    (0, node_test_1.it)('returns [] when no language-tagged artifacts', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const sharedOnly = resolved.artifacts.filter(a => !a.frontmatter.language);
        strict_1.default.deepEqual((0, select_1.buildLanguageOptions)(sharedOnly), []);
    });
    (0, node_test_1.it)('includes All languages option + one per language with count', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const opts = (0, select_1.buildLanguageOptions)(resolved.artifacts);
        strict_1.default.ok(opts.length >= 2, 'at least All + 1 language');
        strict_1.default.equal(opts[0].value, '', 'first option is All languages');
        strict_1.default.ok(opts.slice(1).every(o => o.hint.match(/\d+ artifact/)), 'each language has count hint');
    });
    (0, node_test_1.it)('counts reflect the passed subset, not the whole catalog', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        // Only csharp artifacts
        const csharpOnly = resolved.artifacts.filter(a => a.frontmatter.language === 'csharp');
        const opts = (0, select_1.buildLanguageOptions)(csharpOnly);
        // Only csharp should appear (no python, react)
        const langs = opts.slice(1).map(o => o.value);
        strict_1.default.ok(langs.every(l => l === 'csharp'), 'only csharp in subset options');
        // Count in hint matches actual csharp artifacts
        const csharpOpt = opts.find(o => o.value === 'csharp');
        strict_1.default.ok(csharpOpt?.hint.startsWith(`${csharpOnly.length} artifact`), 'count matches subset');
    });
});
// ─── Part C: per-target kind vocabulary ───────────────────────────────────────
(0, node_test_1.describe)('kindNoun / kindPlural / kindHint (per-AI vocabulary)', () => {
    (0, node_test_1.it)('prompt → command on Claude Code', () => {
        const target = new claude_code_1.ClaudeCodeTarget();
        strict_1.default.equal((0, select_1.kindNoun)(target, 'prompt'), 'command', 'Claude: prompt noun is command');
        strict_1.default.equal((0, select_1.kindPlural)(target, 'prompt'), 'Commands', 'Claude: prompt plural is Commands');
    });
    (0, node_test_1.it)('rule → instructions on Copilot', () => {
        const target = new copilot_1.CopilotTarget();
        strict_1.default.equal((0, select_1.kindNoun)(target, 'rule'), 'instructions', 'Copilot: rule noun is instructions');
        strict_1.default.equal((0, select_1.kindPlural)(target, 'rule'), 'Instructions', 'Copilot: rule plural is Instructions');
    });
    (0, node_test_1.it)('prompt → prompt on Copilot (stays neutral)', () => {
        const target = new copilot_1.CopilotTarget();
        strict_1.default.equal((0, select_1.kindNoun)(target, 'prompt'), 'prompt', 'Copilot: prompt stays prompt');
        strict_1.default.equal((0, select_1.kindPlural)(target, 'prompt'), 'Prompts', 'Copilot: prompt plural is Prompts');
    });
    (0, node_test_1.it)('skill stays skill on both platforms', () => {
        const claude = new claude_code_1.ClaudeCodeTarget();
        const copilot = new copilot_1.CopilotTarget();
        strict_1.default.equal((0, select_1.kindNoun)(claude, 'skill'), 'skill', 'Claude: skill stays skill');
        strict_1.default.equal((0, select_1.kindNoun)(copilot, 'skill'), 'skill', 'Copilot: skill stays skill');
    });
    (0, node_test_1.it)('fallback: undefined target returns raw catalog kind', () => {
        strict_1.default.equal((0, select_1.kindNoun)(undefined, 'prompt'), 'prompt', 'no target: raw kind returned');
        strict_1.default.equal((0, select_1.kindNoun)(undefined, 'rule'), 'rule', 'no target: raw kind returned');
        strict_1.default.equal((0, select_1.kindPlural)(undefined, 'skill'), 'Skills', 'no target: simple plural fallback');
    });
    (0, node_test_1.it)('fallback: unmapped kind returns raw kind / simple plural', () => {
        const target = new claude_code_1.ClaudeCodeTarget();
        strict_1.default.equal((0, select_1.kindNoun)(target, 'some-new-kind'), 'some-new-kind', 'unmapped kind: raw noun');
        strict_1.default.equal((0, select_1.kindPlural)(target, 'some-new-kind'), 'Some-new-kinds', 'unmapped kind: simple plural');
    });
    (0, node_test_1.it)('kindHint returns platform-specific hint when declared', () => {
        const claude = new claude_code_1.ClaudeCodeTarget();
        const copilot = new copilot_1.CopilotTarget();
        strict_1.default.ok((0, select_1.kindHint)(claude, 'prompt')?.includes('command'), 'Claude command hint mentions command');
        strict_1.default.ok((0, select_1.kindHint)(copilot, 'rule')?.includes('instructions'), 'Copilot rule hint mentions instructions');
        strict_1.default.equal((0, select_1.kindHint)(undefined, 'skill'), undefined, 'no target: no hint');
    });
});
// ─── Part D: output-conformance contracts ─────────────────────────────────────
(0, node_test_1.describe)('checkOutputContract — green paths (existing output passes)', () => {
    (0, node_test_1.it)('Claude full compile output satisfies all contracts', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new claude_code_1.ClaudeCodeTarget();
        const files = await target.compile(resolved, { version: VERSION, packs: PACKS });
        const violations = (0, output_contract_1.checkOutputContract)(files, target.outputContracts ?? []);
        strict_1.default.deepEqual(violations, [], `Claude compile has violations:\n${violations.map(v => `  [${v.label}] ${v.file}: ${v.problem}`).join('\n')}`);
    });
    (0, node_test_1.it)('Copilot full compile output satisfies all contracts', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new copilot_1.CopilotTarget();
        const files = await target.compile(resolved, { version: VERSION, packs: PACKS });
        const violations = (0, output_contract_1.checkOutputContract)(files, target.outputContracts ?? []);
        strict_1.default.deepEqual(violations, [], `Copilot compile has violations:\n${violations.map(v => `  [${v.label}] ${v.file}: ${v.problem}`).join('\n')}`);
    });
    (0, node_test_1.it)('Claude scaffold of prompt (command) satisfies all contracts', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new claude_code_1.ClaudeCodeTarget();
        const files = await target.scaffold('shared/explain-diff', resolved, { projectDir: '/fake' });
        const violations = (0, output_contract_1.checkOutputContract)(files, target.outputContracts ?? []);
        strict_1.default.deepEqual(violations, [], `Claude prompt scaffold has violations:\n${violations.map(v => `  [${v.label}] ${v.file}: ${v.problem}`).join('\n')}`);
    });
    (0, node_test_1.it)('Copilot scaffold of prompt file satisfies all contracts', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new copilot_1.CopilotTarget();
        const files = await target.scaffold('shared/explain-diff', resolved, { projectDir: '/fake' });
        const violations = (0, output_contract_1.checkOutputContract)(files, target.outputContracts ?? []);
        strict_1.default.deepEqual(violations, [], `Copilot prompt scaffold has violations:\n${violations.map(v => `  [${v.label}] ${v.file}: ${v.problem}`).join('\n')}`);
    });
    (0, node_test_1.it)('Copilot scaffold of skill satisfies all contracts', async () => {
        const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
        const resolved = (0, resolve_1.resolveCatalog)(catalog);
        const target = new copilot_1.CopilotTarget();
        const files = await target.scaffold('csharp/xunit-testing', resolved, { projectDir: '/fake' });
        const violations = (0, output_contract_1.checkOutputContract)(files, target.outputContracts ?? []);
        strict_1.default.deepEqual(violations, [], `Copilot skill scaffold has violations:\n${violations.map(v => `  [${v.label}] ${v.file}: ${v.problem}`).join('\n')}`);
    });
});
(0, node_test_1.describe)('checkOutputContract — red paths (violations detected)', () => {
    (0, node_test_1.it)('Claude command with forbidden name: key is flagged', () => {
        const target = new claude_code_1.ClaudeCodeTarget();
        const badFiles = {
            '.claude/commands/my-cmd.md': '---\ndescription: "Explain a diff"\nname: should-not-be-here\n---\nBody here',
        };
        const violations = (0, output_contract_1.checkOutputContract)(badFiles, target.outputContracts ?? []);
        strict_1.default.ok(violations.length > 0, 'violation expected for forbidden name: key');
        strict_1.default.ok(violations.some(v => v.problem.includes("'name'")), `violation message should mention 'name' — got: ${violations[0].problem}`);
    });
    (0, node_test_1.it)('Claude command without required description: is flagged', () => {
        const target = new claude_code_1.ClaudeCodeTarget();
        const badFiles = {
            '.claude/commands/my-cmd.md': '---\nargument-hint: "[diff]"\n---\nBody',
        };
        const violations = (0, output_contract_1.checkOutputContract)(badFiles, target.outputContracts ?? []);
        strict_1.default.ok(violations.some(v => v.problem.includes("'description'")), 'violation expected for missing description');
    });
    (0, node_test_1.it)('Claude command body with unresolved {{placeholder}} is flagged', () => {
        const target = new claude_code_1.ClaudeCodeTarget();
        const badFiles = {
            '.claude/commands/my-cmd.md': '---\ndescription: "foo"\n---\nPlease explain {{diff}} to me',
        };
        const violations = (0, output_contract_1.checkOutputContract)(badFiles, target.outputContracts ?? []);
        strict_1.default.ok(violations.some(v => v.problem.includes('{{')), 'unresolved {{ placeholder must be flagged');
    });
    (0, node_test_1.it)('Claude command body with Copilot ${input:…} syntax is flagged', () => {
        const target = new claude_code_1.ClaudeCodeTarget();
        const badFiles = {
            '.claude/commands/my-cmd.md': '---\ndescription: "foo"\n---\nPlease explain ${input:diff} to me',
        };
        const violations = (0, output_contract_1.checkOutputContract)(badFiles, target.outputContracts ?? []);
        strict_1.default.ok(violations.some(v => v.problem.includes('${input:')), 'Copilot placeholder syntax in Claude command must be flagged');
    });
    (0, node_test_1.it)('Copilot prompt file with unresolved {{placeholder}} is flagged', () => {
        const target = new copilot_1.CopilotTarget();
        const badFiles = {
            '.github/prompts/bad.prompt.md': '---\nagent: agent\ndescription: "foo"\n---\nHello {{name}}',
        };
        const violations = (0, output_contract_1.checkOutputContract)(badFiles, target.outputContracts ?? []);
        strict_1.default.ok(violations.some(v => v.problem.includes('{{')), 'unresolved {{ in Copilot prompt must be flagged');
    });
    (0, node_test_1.it)('Copilot SKILL.md with forbidden applyTo: is flagged', () => {
        const target = new copilot_1.CopilotTarget();
        const badFiles = {
            '.github/skills/test-skill/SKILL.md': '---\nname: test-skill\ndescription: "foo"\napplyTo: "**/*.ts"\n---\nBody',
        };
        const violations = (0, output_contract_1.checkOutputContract)(badFiles, target.outputContracts ?? []);
        strict_1.default.ok(violations.some(v => v.problem.includes("'applyTo'")), 'applyTo in Copilot SKILL.md must be flagged');
    });
    (0, node_test_1.it)('Copilot SKILL.md with forbidden paths: is flagged', () => {
        const target = new copilot_1.CopilotTarget();
        const badFiles = {
            '.github/skills/test-skill/SKILL.md': '---\nname: test-skill\ndescription: "foo"\npaths:\n  - "**/*.ts"\n---\nBody',
        };
        const violations = (0, output_contract_1.checkOutputContract)(badFiles, target.outputContracts ?? []);
        strict_1.default.ok(violations.some(v => v.problem.includes("'paths'")), 'paths: in Copilot SKILL.md must be flagged');
    });
    (0, node_test_1.it)('files matching no contract entry are silently skipped (no false positives)', () => {
        const target = new copilot_1.CopilotTarget();
        // AGENTS.md and copilot-instructions.md have no matching entry
        const irrelevantFiles = {
            '.github/AGENTS.md': '# AI Agents\n\n## code-reviewer\nBody',
            '.github/copilot-instructions.md': '# Copilot Instructions\n\n## Clean Code\nBody',
        };
        const violations = (0, output_contract_1.checkOutputContract)(irrelevantFiles, target.outputContracts ?? []);
        strict_1.default.deepEqual(violations, [], 'aggregate files should not trigger false violations');
    });
});
// ─── Part E — platforms field + source validation ──────────────────────────────
(0, node_test_1.describe)('Part E — platforms field + source validation', () => {
    // ── E1 — artifactTargetsPlatform helper ─────────────────────────────────────
    (0, node_test_1.describe)('E1 — artifactTargetsPlatform helper', () => {
        (0, node_test_1.it)('absent platforms → always true', () => {
            const a = { frontmatter: {} };
            strict_1.default.equal((0, select_2.artifactTargetsPlatform)(a, 'claude'), true);
        });
        (0, node_test_1.it)('empty platforms array → true', () => {
            const a = { frontmatter: { platforms: [] } };
            strict_1.default.equal((0, select_2.artifactTargetsPlatform)(a, 'copilot'), true);
        });
        (0, node_test_1.it)('platforms match → true', () => {
            const a = { frontmatter: { platforms: ['claude'] } };
            strict_1.default.equal((0, select_2.artifactTargetsPlatform)(a, 'claude'), true);
        });
        (0, node_test_1.it)('platforms mismatch → false', () => {
            const a = { frontmatter: { platforms: ['claude'] } };
            strict_1.default.equal((0, select_2.artifactTargetsPlatform)(a, 'copilot'), false);
        });
    });
    // ── E2 — platforms math ──────────────────────────────────────────────────────
    (0, node_test_1.describe)('E2 — platforms math', () => {
        (0, node_test_1.it)('effectivePlatforms: absent → all supporting targets', () => {
            const targets = (0, targets_1.getAllTargets)();
            const result = (0, platforms_1.effectivePlatforms)('skill', undefined, targets);
            strict_1.default.ok(result.includes('claude'), 'claude in effective platforms');
            strict_1.default.ok(result.includes('copilot'), 'copilot in effective platforms');
        });
        (0, node_test_1.it)('effectivePlatforms: restricted → subset', () => {
            const targets = (0, targets_1.getAllTargets)();
            const result = (0, platforms_1.effectivePlatforms)('skill', ['claude'], targets);
            strict_1.default.deepEqual(result, ['claude']);
        });
        (0, node_test_1.it)('isFullCoverage: full set → true', () => {
            const targets = (0, targets_1.getAllTargets)();
            const allNames = targets.map(t => t.name);
            strict_1.default.equal((0, platforms_1.isFullCoverage)('skill', allNames, targets), true);
        });
        (0, node_test_1.it)('normalizePlatforms: full set → undefined', () => {
            const targets = (0, targets_1.getAllTargets)();
            const allNames = targets.map(t => t.name);
            strict_1.default.equal((0, platforms_1.normalizePlatforms)('skill', allNames, targets), undefined);
        });
        (0, node_test_1.it)('addPlatforms: add already covered → noOp=true', () => {
            const targets = (0, targets_1.getAllTargets)();
            const result = (0, platforms_1.addPlatforms)('skill', ['claude', 'copilot'], ['claude'], targets);
            strict_1.default.equal(result.noOp, true, 'adding an already-covered platform is a noOp');
        });
        (0, node_test_1.it)('removePlatforms: remove all → errors not empty', () => {
            const targets = (0, targets_1.getAllTargets)();
            const result = (0, platforms_1.removePlatforms)('skill', ['claude'], ['claude'], targets);
            strict_1.default.ok(result.errors.length > 0, 'removing the last platform should produce an error');
            strict_1.default.ok(result.errors[0].includes('Cannot remove all') || result.errors[0].includes('no platform'), `error message should mention platform removal constraint — got: ${result.errors[0]}`);
        });
    });
    // ── E3 — checkSourceArtifact ─────────────────────────────────────────────────
    (0, node_test_1.describe)('E3 — checkSourceArtifact', () => {
        (0, node_test_1.it)('existing valid artifact → no violations', async () => {
            const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
            const skill = catalog.byId.get('csharp/xunit-testing');
            strict_1.default.ok(skill, 'csharp/xunit-testing must exist in catalog');
            const targets = (0, targets_1.getAllTargets)();
            const violations = (0, check_source_1.checkSourceArtifact)(skill, catalog, targets);
            strict_1.default.deepEqual(violations, [], `Expected no violations for a valid artifact, got:\n${violations.map(v => v.problem).join('\n')}`);
        });
        (0, node_test_1.it)('id mismatch → violation', async () => {
            const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
            const real = catalog.byId.get('csharp/xunit-testing');
            strict_1.default.ok(real, 'csharp/xunit-testing must exist');
            // id name segment ('wrong-id') doesn't match the frontmatter name ('xunit-testing')
            const synthetic = {
                ...real,
                id: 'csharp/wrong-id',
                frontmatter: { ...real.frontmatter, id: 'csharp/wrong-id' },
            };
            const targets = (0, targets_1.getAllTargets)();
            const violations = (0, check_source_1.checkSourceArtifact)(synthetic, catalog, targets);
            strict_1.default.ok(violations.length > 0, 'expected at least one violation for id/name mismatch');
        });
        (0, node_test_1.it)('unknown platforms → violation', async () => {
            const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
            const real = catalog.byId.get('shared/clean-code');
            strict_1.default.ok(real, 'shared/clean-code must exist');
            const synthetic = {
                ...real,
                frontmatter: { ...real.frontmatter, platforms: ['nonexistent-target'] },
            };
            const targets = (0, targets_1.getAllTargets)();
            const violations = (0, check_source_1.checkSourceArtifact)(synthetic, catalog, targets);
            strict_1.default.ok(violations.some(v => v.problem.includes('nonexistent-target')), `expected violation mentioning unknown platform — got: ${violations.map(v => v.problem).join('; ')}`);
        });
        (0, node_test_1.it)('kebab-case violation → violation', async () => {
            const catalog = await (0, load_1.loadCatalog)(CATALOG_DIR);
            const real = catalog.byId.get('csharp/xunit-testing');
            strict_1.default.ok(real, 'csharp/xunit-testing must exist');
            // name 'Not_Kebab' is not kebab-case; id name must also match, so keep them in sync
            const synthetic = {
                ...real,
                id: 'csharp/Not_Kebab',
                frontmatter: { ...real.frontmatter, id: 'csharp/Not_Kebab', name: 'Not_Kebab' },
            };
            const targets = (0, targets_1.getAllTargets)();
            const violations = (0, check_source_1.checkSourceArtifact)(synthetic, catalog, targets);
            strict_1.default.ok(violations.some(v => v.problem.includes('kebab-case')), `expected kebab-case violation — got: ${violations.map(v => v.problem).join('; ')}`);
        });
        (0, node_test_1.it)('dep coverage drift → violation', () => {
            // Build a minimal fake catalog: a skill restricted to copilot that uses a
            // rule restricted to claude only. The dep checker should flag the drift.
            const fakeRule = {
                id: 'fake/restricted-rule',
                kind: 'rule',
                filePath: '/fake/restricted-rule.rule.md',
                frontmatter: {
                    id: 'fake/restricted-rule',
                    kind: 'rule',
                    title: 'Restricted Rule',
                    description: 'A rule restricted to claude only.',
                    severity: 'recommended',
                    appliesTo: ['**/*'],
                    platforms: ['claude'],
                },
                body: '- Rule body.',
            };
            const fakeSkill = {
                id: 'fake/drift-skill',
                kind: 'skill',
                filePath: '/fake/drift-skill/SKILL.md',
                frontmatter: {
                    id: 'fake/drift-skill',
                    kind: 'skill',
                    title: 'Drift Skill',
                    description: 'A skill targeting copilot that uses a claude-only rule.',
                    name: 'drift-skill',
                    language: 'fake',
                    platforms: ['copilot'],
                    uses: { rules: ['fake/restricted-rule'] },
                },
                body: 'Skill body.',
            };
            const fakeCatalog = {
                artifacts: [fakeRule, fakeSkill],
                byId: new Map([
                    [fakeRule.id, fakeRule],
                    [fakeSkill.id, fakeSkill],
                ]),
                languages: new Map(),
            };
            const targets = (0, targets_1.getAllTargets)();
            const violations = (0, check_source_1.checkSourceArtifact)(fakeSkill, fakeCatalog, targets);
            strict_1.default.ok(violations.some(v => v.problem.includes('coverage drift') || v.problem.includes('restricted')), `expected a coverage drift violation — got: ${violations.map(v => v.problem).join('; ')}`);
        });
    });
    // ── E4 — headerFor ───────────────────────────────────────────────────────────
    (0, node_test_1.describe)('E5 — buildEquivalentNewCommand', () => {
        (0, node_test_1.it)('includes kind and --name always', () => {
            const cmd = (0, wizard_1.buildEquivalentNewCommand)({ kind: 'rule', name: 'my-rule' });
            strict_1.default.ok(cmd.startsWith('maku-catalog new rule'), 'starts with new rule');
            strict_1.default.ok(cmd.includes('--name my-rule'), '--name present');
            strict_1.default.ok(cmd.endsWith('--yes'), 'ends with --yes');
        });
        (0, node_test_1.it)('omits --language when shared (undefined)', () => {
            const cmd = (0, wizard_1.buildEquivalentNewCommand)({ kind: 'agent', name: 'sql-reviewer' });
            strict_1.default.ok(!cmd.includes('--language'), '--language absent when shared');
        });
        (0, node_test_1.it)('includes --language when specified', () => {
            const cmd = (0, wizard_1.buildEquivalentNewCommand)({ kind: 'skill', name: 'ef-core', language: 'csharp' });
            strict_1.default.ok(cmd.includes('--language csharp'), '--language present');
        });
        (0, node_test_1.it)('omits --platforms when unrestricted (undefined)', () => {
            const cmd = (0, wizard_1.buildEquivalentNewCommand)({ kind: 'prompt', name: 'my-prompt' });
            strict_1.default.ok(!cmd.includes('--platforms'), '--platforms absent when unrestricted');
        });
        (0, node_test_1.it)('includes --platforms when restricted', () => {
            const cmd = (0, wizard_1.buildEquivalentNewCommand)({ kind: 'rule', name: 'my-rule', platforms: ['claude'] });
            strict_1.default.ok(cmd.includes('--platforms claude'), '--platforms present when restricted');
        });
        (0, node_test_1.it)('joins multiple platforms with comma', () => {
            const cmd = (0, wizard_1.buildEquivalentNewCommand)({ kind: 'agent', name: 'rev', platforms: ['claude', 'copilot'] });
            strict_1.default.ok(cmd.includes('--platforms claude,copilot'), 'multiple platforms comma-joined');
        });
    });
    (0, node_test_1.describe)('E4 — headerFor', () => {
        (0, node_test_1.it)('skill header contains required fields', () => {
            const result = (0, header_1.headerFor)('skill', {
                id: 'csharp/foo',
                kind: 'skill',
                title: 'Foo',
                description: 'Foo desc',
                name: 'foo',
                language: 'csharp',
            });
            strict_1.default.ok(result.includes('id: csharp/foo'), 'id field present');
            strict_1.default.ok(result.includes('kind: skill'), 'kind field present');
            strict_1.default.ok(result.includes('name: foo'), 'name field present');
            strict_1.default.ok(result.includes('language: csharp'), 'language field present');
        });
        (0, node_test_1.it)('restricted platforms emitted active', () => {
            const result = (0, header_1.headerFor)('rule', {
                id: 'shared/bar',
                kind: 'rule',
                title: 'Bar',
                description: 'Bar desc',
                platforms: ['claude'],
            });
            // Active platforms: block should be present (not commented out)
            strict_1.default.ok(result.includes('platforms:'), 'platforms: key present');
            strict_1.default.ok(result.includes('  - claude'), '  - claude entry present');
        });
        (0, node_test_1.it)('unrestricted platforms emitted as comment only', () => {
            const result = (0, header_1.headerFor)('agent', {
                id: 'shared/baz',
                kind: 'agent',
                title: 'Baz',
                description: 'Baz desc',
                name: 'baz',
            });
            // Comment-only platforms hint should be present
            strict_1.default.ok(result.includes('# platforms:'), '# platforms: comment present');
            // No active (non-comment) platforms: line should exist
            const activeplatformsLine = result.split('\n').find(l => /^platforms:/.test(l));
            strict_1.default.equal(activeplatformsLine, undefined, 'no active platforms: line when not restricted');
        });
    });
});
