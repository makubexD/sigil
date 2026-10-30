/**
 * Tests for src/targets/claude-code/ — compile (plugin build) and scaffold.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveCatalog } from '../../dist-cli/resolve';
import { ClaudeCodeTarget } from '../../dist-cli/targets/claude-code';
import { CLAUDE_PROMPT_SPEC } from '../../dist-cli/targets/claude-code/spec/prompt';
import type { CompileOptions, MarketplaceIdentity } from '../../dist-cli/types';
import { loadBundledCatalog } from '../helpers/catalog';

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

function compileOpts(marketplace?: MarketplaceIdentity): CompileOptions {
  return { version: VERSION, packs: PACKS, ...(marketplace ? { marketplace } : {}) };
}

describe('Claude Code target', () => {
  it('emits marketplace.json with all packs (flat top-level schema)', async () => {
    const catalog = await loadBundledCatalog();
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
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    const pluginJson = JSON.parse(files['plugins/dotnet-pack/.claude-plugin/plugin.json']!);
    assert.equal(pluginJson.version, VERSION, 'plugin version matches npm version');
    assert.equal(pluginJson.name, 'dotnet-pack');
  });

  it('emits a SKILL.md with the rule body inlined', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    const skillMd = files['plugins/dotnet-pack/skills/cs-generate-tests/SKILL.md'];
    assert.ok(skillMd, 'cs-generate-tests SKILL.md emitted');
    assert.ok(skillMd.includes('Generate Tests'), 'skill body present');
    assert.ok(skillMd.includes('Applied Rules'), 'rules section present');
    assert.ok(skillMd.includes('xUnit'), 'cs-testing rule content inlined');
    // Skills have no `paths:` equivalent — Claude Code dispatches skills by description
    // relevance, not file path; `paths:` is a `.claude/rules/*.md`-only mechanism.
    // See: code.claude.com/docs/en/skills
    assert.ok(!skillMd.includes('paths:'), 'no paths: emitted for a skill');
    assert.ok(!skillMd.includes('appliesTo:'), 'appliesTo not emitted in Claude output');
    // description must be safely quoted (not a bare plain scalar)
    assert.ok(skillMd.match(/description:\s*"/), 'description is a quoted YAML scalar');
  });

  it('emits the language-specific code-reviewer agent into the dotnet pack', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    assert.ok(
      'plugins/dotnet-pack/agents/cs-code-reviewer.md' in files,
      'cs-code-reviewer agent emitted into dotnet-pack',
    );
  });

  it('scaffold: writes skill + closure into .claude/', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.scaffold!('csharp/cs-generate-tests', resolved, {
      projectDir: '/fake',
    });

    assert.ok('.claude/skills/cs-generate-tests/SKILL.md' in files, 'skill scaffolded');
    assert.ok('.claude/rules/csharp-cs-testing.md' in files, 'rule scaffolded');
    assert.ok('.claude/agents/cs-code-reviewer.md' in files, 'agent scaffolded');
  });

  it('scaffold: rule with appliesTo has paths: frontmatter regardless of language', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.scaffold!('csharp/cs-generate-tests', resolved, {
      projectDir: '/fake',
    });

    const languageRule = files['.claude/rules/csharp-cs-testing.md'];
    assert.ok(languageRule, 'csharp rule scaffolded');
    assert.ok(languageRule.includes('paths:'), 'language rule has paths: frontmatter');
    assert.ok(languageRule.includes('*.cs'), 'csharp glob present');

    // shared/clean-code has no `language` but declares appliesTo: ["**/*"] — it must still
    // get a `paths:` block derived from that appliesTo (A1 fix: dropping `hasLanguage` from
    // the gate). Only a rule with no appliesTo at all gets no frontmatter.
    const sharedFiles = await target.scaffold!('shared/clean-code', resolved, {
      projectDir: '/fake',
    });
    const sharedRule = sharedFiles['.claude/rules/shared-clean-code.md'];
    assert.ok(sharedRule, 'shared rule scaffolded');
    assert.ok(
      sharedRule.startsWith('---') && sharedRule.includes('paths:'),
      'shared rule with appliesTo still gets paths: frontmatter, not dropped for lacking a language',
    );
    assert.ok(sharedRule.includes('**/*'), 'appliesTo glob present verbatim');
  });
});

describe('Claude scaffold: prompt with args', () => {
  it('emits description, argument-hint, arguments frontmatter and $name body', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.scaffold!('shared/explain-diff', resolved, { projectDir: '/fake' });

    const f = files['.claude/skills/shared-explain-diff/SKILL.md'];
    assert.ok(f, 'prompt emitted as a skill at .claude/skills/shared-explain-diff/SKILL.md');
    assert.ok(f.startsWith('---'), 'skill file starts with YAML frontmatter');
    assert.ok(f.includes('name: shared-explain-diff'), 'name field present');
    assert.ok(f.includes('description:'), 'description field present');
    assert.ok(f.includes('argument-hint:'), 'argument-hint field present');
    assert.ok(f.includes('[diff]'), 'diff arg in argument-hint');
    assert.ok(f.includes('[audience]'), 'audience arg in argument-hint');
    assert.ok(f.includes('arguments:'), 'arguments list present');
    assert.ok(f.includes('  - diff'), 'diff in arguments list');
    assert.ok(f.includes('  - audience'), 'audience in arguments list');
    assert.ok(
      f.includes('disable-model-invocation: true'),
      'user-invoked only, like the retired command format',
    );
    assert.ok(!f.includes('{{diff}}'), '{{diff}} placeholder translated');
    assert.ok(f.includes('$diff'), '$diff substitution present');
  });
});

// Regression coverage for the unresolved-{{…}} check that checkOutputContract() can no longer
// enforce for CLAUDE_PROMPT_SPEC's path (see the "CONTRACT ROUTING NOTE" in spec/prompt.ts: it
// shares .claude/skills/<name>/SKILL.md with `skill`, whose contract can't forbid {{ }} since real
// skills — Angular — legitimately contain it). Asserted directly against the spec instead.
// CLAUDE_WORKFLOW_SPEC has no such check by design — its bodies never carry {{name}} placeholders
// in the first place (no bodyTransform, unlike prompt's toClaudePlaceholders).
describe('CLAUDE_PROMPT_SPEC — unresolved {{…}} still forbidden at the spec level', () => {
  it('should list an unresolved-{{…}} bodyForbid', () => {
    assert.ok(
      CLAUDE_PROMPT_SPEC.bodyForbids.some(f => f.pattern.test('{{diff}}')),
      'CLAUDE_PROMPT_SPEC must still forbid an unresolved {{…}} placeholder',
    );
  });
});

describe('Claude Code target: marketplace identity', () => {
  it('should emit a full marketplace block into marketplace.json and every plugin.json', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const marketplace = {
      name: 'acme-ai',
      owner: { name: 'Acme', url: 'https://acme.dev', email: 'team@acme.dev' },
      description: 'Acme internal skills.',
      author: {
        name: 'Acme Platform',
        url: 'https://acme.dev/platform',
        email: 'platform@acme.dev',
      },
      license: 'Apache-2.0',
      homepage: 'https://acme.dev',
    };
    const files = await target.compile(resolved, compileOpts(marketplace));

    const mkt = JSON.parse(files['.claude-plugin/marketplace.json']!);
    assert.equal(mkt.name, 'acme-ai', 'marketplace name');
    assert.deepEqual(mkt.owner, marketplace.owner, 'marketplace owner');
    assert.equal(mkt.description, marketplace.description, 'marketplace description');

    for (const pack of PACKS) {
      const pluginJson = JSON.parse(files[`plugins/${pack.name}/.claude-plugin/plugin.json`]!);
      assert.deepEqual(pluginJson.author, marketplace.author, `${pack.name} author`);
      assert.equal(pluginJson.license, 'Apache-2.0', `${pack.name} license`);
    }
  });

  it('should omit fields a minimal marketplace block leaves out', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.compile(
      resolved,
      compileOpts({ name: 'acme-ai', owner: { name: 'Acme' } }),
    );

    const mkt = JSON.parse(files['.claude-plugin/marketplace.json']!);
    assert.equal(mkt.name, 'acme-ai');
    assert.ok(!('description' in mkt), 'no description key when the block leaves it out');
    assert.deepEqual(mkt.owner, { name: 'Acme' }, 'owner is exactly the configured one');

    for (const pack of PACKS) {
      const pluginJson = JSON.parse(files[`plugins/${pack.name}/.claude-plugin/plugin.json`]!);
      assert.deepEqual(
        pluginJson.author,
        { name: 'Acme' },
        `${pack.name} author falls back to owner`,
      );
      assert.ok(!('license' in pluginJson), `${pack.name} has no license key`);
    }
  });

  it('should use marketplace.homepage as the default url for owner and author', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.compile(
      resolved,
      compileOpts({
        name: 'acme-ai',
        owner: { name: 'Acme' },
        author: { name: 'Acme' },
        homepage: 'https://acme.dev',
      }),
    );

    const mkt = JSON.parse(files['.claude-plugin/marketplace.json']!);
    assert.deepEqual(mkt.owner, { name: 'Acme', url: 'https://acme.dev' }, 'owner url defaulted');

    for (const pack of PACKS) {
      const pluginJson = JSON.parse(files[`plugins/${pack.name}/.claude-plugin/plugin.json`]!);
      assert.deepEqual(
        pluginJson.author,
        { name: 'Acme', url: 'https://acme.dev' },
        `${pack.name} author url defaulted`,
      );
    }
  });

  it('should keep the sigil identity when no marketplace block is configured', async () => {
    const catalog = await loadBundledCatalog();
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.compile(resolved, compileOpts());

    const mkt = JSON.parse(files['.claude-plugin/marketplace.json']!);
    assert.equal(mkt.name, 'sigil');
    assert.equal(mkt.owner.name, 'Sigil');

    for (const pack of PACKS) {
      const pluginJson = JSON.parse(files[`plugins/${pack.name}/.claude-plugin/plugin.json`]!);
      assert.equal(pluginJson.license, 'MIT', `${pack.name} keeps the MIT default`);
    }
  });
});
