/**
 * Tests for src/targets/copilot/ — compile (full build) and scaffold.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../../dist-cli/load';
import { resolveCatalog } from '../../dist-cli/resolve';
import { CopilotTarget } from '../../dist-cli/targets/copilot';
import { loadResolvedCatalog } from '../helpers/catalog';
import { COPILOT_RULE_SPEC } from '../../dist-cli/targets/copilot/spec/rule';
import { COPILOT_SKILL_SPEC } from '../../dist-cli/targets/copilot/spec/skill';
import { renderArtifact } from '../../dist-cli/targets/emit';
import type { ResolvedArtifact } from '../../dist-cli/types';
import { CATALOG_DIR } from '../helpers/catalog';
import { makeRule, makeSkill } from '../helpers/fixtures';

/** A rule's .instructions.md, as compile and add write it. */
const buildInstructionsFile = (rule: Parameters<typeof renderArtifact>[1]) =>
  renderArtifact(COPILOT_RULE_SPEC, rule, {});

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
  {
    name: 'typescript-pack',
    displayName: 'TypeScript Pack',
    description: 'TypeScript skills and agents',
    languages: ['typescript'],
  },
];

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

  it('buildInstructionsFile: language-less rule with narrow appliesTo keeps its own glob (A1)', () => {
    // shared/clean-code-style has no `language` but authors a narrow appliesTo — the Claude
    // adapter's A1 fix (claude-code/spec/rule.ts) already honors this; the Copilot adapter must too.
    const rule = makeRule({
      id: 'shared/markdown-style',
      title: 'Markdown Style',
      language: undefined,
      appliesTo: ['**/*.md'],
    });

    const content = buildInstructionsFile(
      rule as unknown as Parameters<typeof buildInstructionsFile>[0],
    );

    assert.ok(content.includes('applyTo: "**/*.md"'), 'authored glob is used verbatim');
    assert.ok(
      !content.includes('applyTo: "**"'),
      'must not fall back to ** when appliesTo is authored',
    );
  });

  it('buildInstructionsFile: emits the rule description for on-demand discovery', () => {
    // Copilot CLI lists every path-specific file in an index (applyTo | path | description) and
    // lets the model open the relevant ones; without a description the model sees only a file
    // name (2026-09-27 live-prompt campaign). VS Code: "Include it for on-demand discovery."
    const rule = makeRule({
      id: 'shared/cli-rules',
      description: 'CLI grammar: flags, help: exit codes',
      appliesTo: ['**/cli/**/*.py'],
    });

    const content = buildInstructionsFile(
      rule as unknown as Parameters<typeof buildInstructionsFile>[0],
    );

    assert.match(content, /^description: "CLI grammar: flags, help: exit codes"$/m);
  });

  it('buildInstructionsFile: rule with no appliesTo at all falls back to **', () => {
    const rule = makeRule({
      id: 'shared/universal',
      title: 'Universal',
      language: undefined,
      appliesTo: undefined,
    });

    const content = buildInstructionsFile(
      rule as unknown as Parameters<typeof buildInstructionsFile>[0],
    );

    assert.ok(content.includes('applyTo: "**"'), 'no appliesTo at all falls back to **');
  });

  it('emits language-specific instructions with applyTo globs', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new CopilotTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    const instrFile = files['.github/instructions/csharp-cs-conventions.instructions.md'];
    assert.ok(instrFile, 'csharp cs-conventions instructions file emitted');
    assert.ok(instrFile.includes('applyTo'), 'applyTo frontmatter present');
    assert.ok(instrFile.includes('*.cs'), 'cs glob present');
    assert.ok(instrFile.includes('File-Scoped Namespaces'), 'rule body present');
  });

  it('emits skills as native Agent Skills (open standard)', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new CopilotTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    // Skills must now emit as native Agent Skills at .github/skills/<name>/SKILL.md
    // (Copilot Agent Skills open standard, agentskills.io) — NOT as prompt files.
    const skillMd = files['.github/skills/cs-generate-tests/SKILL.md'];
    assert.ok(skillMd, '.github/skills/cs-generate-tests/SKILL.md emitted');
    assert.ok(skillMd.includes('name: cs-generate-tests'), 'name frontmatter present');
    assert.ok(skillMd.includes('description:'), 'description frontmatter present');
    assert.ok(skillMd.includes('Generate Tests'), 'skill body present');
    // Agent Skill frontmatter must NOT include applyTo or paths — skills load by description relevance
    assert.ok(
      !skillMd.includes('applyTo'),
      'no applyTo in SKILL.md (path-matching belongs in instructions)',
    );
    assert.ok(!skillMd.includes('paths:'), 'no paths: in SKILL.md');

    // Supporting files (references) must be written alongside SKILL.md for skills that have them.
    // Use react/react-generate-tests which has references/testing-library.md
    const reactSkillMd = files['.github/skills/react-generate-tests/SKILL.md'];
    assert.ok(reactSkillMd, '.github/skills/react-generate-tests/SKILL.md emitted');
    const reactRef = files['.github/skills/react-generate-tests/references/testing-library.md'];
    assert.ok(
      reactRef,
      'references/testing-library.md emitted alongside SKILL.md (bug-fix: was silently dropped)',
    );

    // No prompt file should be emitted for a skill
    assert.ok(
      !('.github/prompts/cs-generate-tests.prompt.md' in files),
      'skills must NOT emit as .prompt.md (skills and prompts are distinct Copilot artifact types)',
    );
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

  it('renders whenToUse as a "## When to Use" body section (Copilot has no frontmatter field for it)', async () => {
    // Regression test: whenToUse used to be silently dropped for Copilot — present in neither
    // frontmatter (Copilot's SKILL.md carries only name/description) nor body. See
    // copilot/spec/skill.ts's whenToUseSection.
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new CopilotTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    const skillMd = files['.github/skills/ts-audit-deps/SKILL.md'];
    assert.ok(skillMd, '.github/skills/ts-audit-deps/SKILL.md emitted');
    assert.ok(skillMd.includes('## When to Use'), 'When to Use heading present');
    assert.ok(
      skillMd.includes('Complements ts-security-auditor'),
      'authored whenToUse prose present verbatim',
    );

    // A skill authoring no whenToUse frontmatter must not gain a "## When to Use" section.
    // Synthetic fixture rather than a real catalog skill — every catalog skill now authors
    // whenToUse (the 2026-08 audit's when-to-use-quality rule closed that gap), so this
    // negative case would otherwise silently stop being exercised as content changes.
    const noWhenToUseSkill = makeSkill({ whenToUse: undefined }) as unknown as ResolvedArtifact;
    const rendered = renderArtifact(COPILOT_SKILL_SPEC, noWhenToUseSkill, {});
    assert.ok(
      !rendered.includes('## When to Use'),
      'no When to Use section when whenToUse was never authored',
    );
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
    assert.ok(
      content.includes('description:'),
      'description frontmatter present (required by spec)',
    );
    assert.ok(content.match(/description:\s*"/), 'description is safely quoted');
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

  it('regression: .github/prompts/ contains only standalone prompts (not skills)', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new CopilotTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });

    // Verify the per-AI artifact separation: prompts/ must only contain catalog `prompt` kinds,
    // never catalog `skill` kinds (those belong in skills/).
    const promptKeys = Object.keys(files).filter(k => k.startsWith('.github/prompts/'));
    const skillKeys = Object.keys(files).filter(k => k.startsWith('.github/skills/'));

    // The standalone explain-diff prompt must appear in prompts/
    assert.ok(
      promptKeys.some(k => k.includes('shared-explain-diff')),
      'standalone prompt emitted to .github/prompts/',
    );

    // No skill names should leak into prompts/
    assert.ok(
      !promptKeys.some(k => k.includes('cs-generate-tests')),
      'cs-generate-tests (a skill) must NOT appear in .github/prompts/',
    );
    assert.ok(
      !promptKeys.some(k => k.includes('py-generate-tests')),
      'py-generate-tests (a skill) must NOT appear in .github/prompts/',
    );

    // Skills must appear in skills/ with no unresolved {{ placeholders
    assert.ok(
      skillKeys.some(k => k.endsWith('/SKILL.md')),
      'at least one SKILL.md emitted under .github/skills/',
    );
    // Check for unresolved template placeholder pattern {{word}} (no space after {{).
    // Note: Angular skill bodies legitimately use {{ value }} (with spaces) in examples;
    // those are intentional and must not be flagged as unresolved template variables.
    const unresolvedPlaceholder = /\{\{[A-Za-z_]/;
    skillKeys
      .filter(k => k.endsWith('/SKILL.md'))
      .forEach(k => {
        assert.ok(!unresolvedPlaceholder.test(files[k]!), `no unresolved {{placeholder}} in ${k}`);
      });
  });
});

describe('Copilot build — shared rules keep their appliesTo scoping', () => {
  it('should give a narrowly scoped shared rule its own applyTo instructions file', async () => {
    const files = await new CopilotTarget().compile(await loadResolvedCatalog(), {
      version: '0.0.0',
      packs: [],
    });

    const scoped = files['.github/instructions/shared-cli-rules.instructions.md'];
    assert.ok(scoped?.includes('applyTo: "**/cli/**'), 'shared/cli-rules keeps its applyTo globs');
    assert.ok(
      !files['.github/copilot-instructions.md']?.includes("This project's command-line interface"),
      'a scoped rule must not be folded into the repo-wide copilot-instructions.md',
    );
  });

  it('should keep repo-wide shared rules in copilot-instructions.md', async () => {
    const files = await new CopilotTarget().compile(await loadResolvedCatalog(), {
      version: '0.0.0',
      packs: [],
    });

    assert.ok(files['.github/copilot-instructions.md']?.includes('Commit Messages'), 'shared/git');
    assert.ok(!('.github/instructions/shared-git.instructions.md' in files));
  });
});
