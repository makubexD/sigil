/**
 * Tests for src/targets/claude-code/ — compile (plugin build) and scaffold.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../../dist-cli/load';
import { resolveCatalog } from '../../dist-cli/resolve';
import { ClaudeCodeTarget } from '../../dist-cli/targets/claude-code';
import { CATALOG_DIR } from '../helpers/catalog';

const VERSION = '0.1.0';
const PACKS = [
  {
    name: 'dotnet-pack',
    displayName: '.NET / C# Pack',
    description: 'C# skills and agents',
    languages: ['csharp'],
  },
  {
    name: 'python-pack',
    displayName: 'Python Pack',
    description: 'Python skills and agents',
    languages: ['python'],
  },
  {
    name: 'react-pack',
    displayName: 'React Pack',
    description: 'React skills and agents',
    languages: ['react'],
  },
];

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
    assert.equal(marketplace.name, 'sigil', 'name at top level');
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

    const skillMd = files['plugins/dotnet-pack/skills/cs-generate-tests/SKILL.md'];
    assert.ok(skillMd, 'cs-generate-tests SKILL.md emitted');
    assert.ok(skillMd.includes('Generate Tests'), 'skill body present');
    assert.ok(skillMd.includes('Applied Rules'), 'rules section present');
    assert.ok(skillMd.includes('xUnit'), 'cs-testing rule content inlined');
    // `paths:` is the Claude Code–recognized key; `appliesTo` is our vendor-neutral source name
    // See: code.claude.com/docs/en/skills
    assert.ok(skillMd.includes('paths:'), 'paths: field emitted (not appliesTo:)');
    assert.ok(!skillMd.includes('appliesTo:'), 'appliesTo not emitted in Claude output');
    // description must be safely quoted (not a bare plain scalar)
    assert.ok(skillMd.match(/description:\s*"/), 'description is a quoted YAML scalar');
  });

  it('emits the language-specific code-reviewer agent into the dotnet pack', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    assert.ok(
      'plugins/dotnet-pack/agents/cs-code-reviewer.md' in files,
      'cs-code-reviewer agent emitted into dotnet-pack',
    );
  });

  it('scaffold: writes skill + closure into .claude/', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.scaffold!('csharp/cs-generate-tests', resolved, {
      projectDir: '/fake',
    });

    assert.ok('.claude/skills/cs-generate-tests/SKILL.md' in files, 'skill scaffolded');
    assert.ok('.claude/rules/csharp-cs-testing.md' in files, 'rule scaffolded');
    assert.ok('.claude/agents/cs-code-reviewer.md' in files, 'agent scaffolded');
  });

  it('scaffold: language-scoped rule has paths: frontmatter; shared rule does not', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.scaffold!('csharp/cs-generate-tests', resolved, {
      projectDir: '/fake',
    });

    const languageRule = files['.claude/rules/csharp-cs-testing.md'];
    assert.ok(languageRule, 'csharp rule scaffolded');
    assert.ok(languageRule.includes('paths:'), 'language rule has paths: frontmatter');
    assert.ok(languageRule.includes('*.cs'), 'csharp glob present');

    // Scaffold shared rule directly and verify no frontmatter
    const sharedFiles = await target.scaffold!('shared/clean-code', resolved, {
      projectDir: '/fake',
    });
    const sharedRule = sharedFiles['.claude/rules/shared-clean-code.md'];
    assert.ok(sharedRule, 'shared rule scaffolded');
    assert.ok(
      !sharedRule.startsWith('---'),
      'shared rule has no frontmatter (loaded unconditionally)',
    );
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
