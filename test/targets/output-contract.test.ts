/**
 * Tests for src/targets/output-contract.ts — file-level format contracts.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../../dist-cli/load';
import { resolveCatalog } from '../../dist-cli/resolve';
import { checkOutputContract } from '../../dist-cli/targets/output-contract';
import { ClaudeCodeTarget } from '../../dist-cli/targets/claude-code';
import { CopilotTarget } from '../../dist-cli/targets/copilot';
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

describe('checkOutputContract — green paths (existing output passes)', () => {
  it('Claude full compile output satisfies all contracts', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });
    const violations = checkOutputContract(files, target.outputContracts ?? []);
    assert.deepEqual(
      violations,
      [],
      `Claude compile has violations:\n${violations.map(v => `  [${v.label}] ${v.file}: ${v.problem}`).join('\n')}`,
    );
  });

  it('Copilot full compile output satisfies all contracts', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new CopilotTarget();
    const files = await target.compile(resolved, { version: VERSION, packs: PACKS });
    const violations = checkOutputContract(files, target.outputContracts ?? []);
    assert.deepEqual(
      violations,
      [],
      `Copilot compile has violations:\n${violations.map(v => `  [${v.label}] ${v.file}: ${v.problem}`).join('\n')}`,
    );
  });

  it('Claude scaffold of prompt (command) satisfies all contracts', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    const files = await target.scaffold!('shared/explain-diff', resolved, { projectDir: '/fake' });
    const violations = checkOutputContract(files, target.outputContracts ?? []);
    assert.deepEqual(
      violations,
      [],
      `Claude prompt scaffold has violations:\n${violations.map(v => `  [${v.label}] ${v.file}: ${v.problem}`).join('\n')}`,
    );
  });

  it('Copilot scaffold of prompt file satisfies all contracts', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new CopilotTarget();
    const files = await target.scaffold!('shared/explain-diff', resolved, { projectDir: '/fake' });
    const violations = checkOutputContract(files, target.outputContracts ?? []);
    assert.deepEqual(
      violations,
      [],
      `Copilot prompt scaffold has violations:\n${violations.map(v => `  [${v.label}] ${v.file}: ${v.problem}`).join('\n')}`,
    );
  });

  it('Copilot scaffold of skill satisfies all contracts', async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new CopilotTarget();
    const files = await target.scaffold!('csharp/cs-generate-tests', resolved, {
      projectDir: '/fake',
    });
    const violations = checkOutputContract(files, target.outputContracts ?? []);
    assert.deepEqual(
      violations,
      [],
      `Copilot skill scaffold has violations:\n${violations.map(v => `  [${v.label}] ${v.file}: ${v.problem}`).join('\n')}`,
    );
  });

  it('Claude scaffold of skill (with argument-hint) satisfies all contracts', async () => {
    // Regression: argument-hint is a valid Claude SKILL.md field (shows autocomplete hint
    // in the Claude UI) and must NOT be in the forbidden list. Previously, this caused every
    // TS skill scaffold to fail with "forbidden frontmatter key present: 'argument-hint'".
    const catalog = await loadCatalog(CATALOG_DIR);
    const resolved = resolveCatalog(catalog);
    const target = new ClaudeCodeTarget();
    // ts-generate-tests carries argumentHint → emits argument-hint: in SKILL.md
    const files = await target.scaffold!('typescript/ts-generate-tests', resolved, {
      projectDir: '/fake',
    });
    const violations = checkOutputContract(files, target.outputContracts ?? []);
    assert.deepEqual(
      violations,
      [],
      `Claude skill scaffold has violations:\n${violations.map(v => `  [${v.label}] ${v.file}: ${v.problem}`).join('\n')}`,
    );
  });
});

describe('checkOutputContract — red paths (violations detected)', () => {
  // Prompt/workflow kinds now render to the same .claude/skills/<name>/SKILL.md path as `skill`
  // (custom commands merged into skills — see spec/prompt.ts's header). checkOutputContract()
  // routes by path pattern alone, so these files are validated under the skill contract; see the
  // "CONTRACT ROUTING NOTE" in spec/prompt.ts and spec/workflow.ts for why that's correct.
  it('Claude skill (prompt/workflow layout) with forbidden paths: key is flagged', () => {
    const target = new ClaudeCodeTarget();
    const badFiles = {
      '.claude/skills/my-cmd/SKILL.md':
        '---\nname: my-cmd\ndescription: "Explain a diff"\npaths:\n  - "**/*.ts"\n---\nBody here',
    };
    const violations = checkOutputContract(badFiles, target.outputContracts ?? []);
    assert.ok(violations.length > 0, 'violation expected for forbidden paths: key');
    assert.ok(
      violations.some(v => v.problem.includes("'paths'")),
      `violation message should mention 'paths' — got: ${violations[0]!.problem}`,
    );
  });

  it('Claude skill (prompt/workflow layout) without required description: is flagged', () => {
    const target = new ClaudeCodeTarget();
    const badFiles = {
      '.claude/skills/my-cmd/SKILL.md': '---\nname: my-cmd\nargument-hint: "[diff]"\n---\nBody',
    };
    const violations = checkOutputContract(badFiles, target.outputContracts ?? []);
    assert.ok(
      violations.some(v => v.problem.includes("'description'")),
      'violation expected for missing description',
    );
  });

  // NOTE: unresolved {{…}} is intentionally NOT checked through checkOutputContract() for this
  // path — real Claude skills (Angular) legitimately contain literal {{ }} template-binding
  // syntax, so the skill contract that actually routes this path can't forbid it. See the
  // "CONTRACT ROUTING NOTE" in src/targets/claude-code/spec/prompt.ts and the direct
  // CLAUDE_PROMPT_SPEC.bodyForbids assertion in test/targets/claude-code.test.ts instead.

  it('Claude skill (prompt/workflow layout) body with Copilot ${input:…} syntax is flagged', () => {
    const target = new ClaudeCodeTarget();
    const badFiles = {
      '.claude/skills/my-cmd/SKILL.md':
        '---\nname: my-cmd\ndescription: "foo"\n---\nPlease explain ${input:diff} to me',
    };
    const violations = checkOutputContract(badFiles, target.outputContracts ?? []);
    assert.ok(
      violations.some(v => v.problem.includes('${input:')),
      'Copilot placeholder syntax in a Claude skill must be flagged',
    );
  });

  it('Copilot prompt file with unresolved {{placeholder}} is flagged', () => {
    const target = new CopilotTarget();
    const badFiles = {
      '.github/prompts/bad.prompt.md': '---\nagent: agent\ndescription: "foo"\n---\nHello {{name}}',
    };
    const violations = checkOutputContract(badFiles, target.outputContracts ?? []);
    assert.ok(
      violations.some(v => v.problem.includes('{{')),
      'unresolved {{ in Copilot prompt must be flagged',
    );
  });

  it('Copilot SKILL.md with forbidden applyTo: is flagged', () => {
    const target = new CopilotTarget();
    const badFiles = {
      '.github/skills/test-skill/SKILL.md':
        '---\nname: test-skill\ndescription: "foo"\napplyTo: "**/*.ts"\n---\nBody',
    };
    const violations = checkOutputContract(badFiles, target.outputContracts ?? []);
    assert.ok(
      violations.some(v => v.problem.includes("'applyTo'")),
      'applyTo in Copilot SKILL.md must be flagged',
    );
  });

  it('Copilot SKILL.md with forbidden paths: is flagged', () => {
    const target = new CopilotTarget();
    const badFiles = {
      '.github/skills/test-skill/SKILL.md':
        '---\nname: test-skill\ndescription: "foo"\npaths:\n  - "**/*.ts"\n---\nBody',
    };
    const violations = checkOutputContract(badFiles, target.outputContracts ?? []);
    assert.ok(
      violations.some(v => v.problem.includes("'paths'")),
      'paths: in Copilot SKILL.md must be flagged',
    );
  });

  it('files matching no contract entry are silently skipped (no false positives)', () => {
    const target = new CopilotTarget();
    // AGENTS.md and copilot-instructions.md have no matching entry
    const irrelevantFiles = {
      '.github/AGENTS.md': '# AI Agents\n\n## code-reviewer\nBody',
      '.github/copilot-instructions.md': '# Copilot Instructions\n\n## Clean Code\nBody',
    };
    const violations = checkOutputContract(irrelevantFiles, target.outputContracts ?? []);
    assert.deepEqual(violations, [], 'aggregate files should not trigger false violations');
  });
});
