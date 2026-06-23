/**
 * GitHub Copilot target adapter.
 *
 * Full build (compile): emits the .github/ directory layout that Copilot reads natively.
 *   dist/copilot/
 *     .github/
 *       copilot-instructions.md           ← shared baseline rules (apply to all files)
 *       instructions/
 *         <lang>-style.instructions.md    ← language-specific rules with applyTo globs
 *       skills/
 *         <skill-name>/
 *           SKILL.md                      ← native Agent Skill (open standard, agentskills.io)
 *           references/<file>             ← supporting files bundled with the skill
 *       prompts/
 *         <prompt-slug>.prompt.md         ← standalone prompts as /name commands in Copilot Chat
 *       AGENTS.md                         ← all agents declared in one file
 *
 * Scaffold (add): emits per-artifact files — never clobbers an aggregate file.
 *   .github/
 *     skills/<name>/SKILL.md              ← native Agent Skill (open standard)
 *     skills/<name>/references/<file>     ← supporting files
 *     instructions/<slug>.instructions.md ← language rule, or shared rule with applyTo: "**"
 *     prompts/<slug>.prompt.md            ← standalone prompt (NOT skills)
 *     agents/<name>.agent.md              ← one file per agent (required extension + frontmatter)
 *
 * Mapping from canonical → Copilot (per-AI vocabulary, verified June 2026):
 *   skill  → .github/skills/<name>/SKILL.md    (Agent Skills open standard; /name in Copilot Chat)
 *   agent  → .github/agents/<name>.agent.md    (per-file in scaffold; AGENTS.md in build)
 *   rule   → .github/instructions/<id>.instructions.md (applyTo from canonicalAppliesTo)
 *             Baseline (shared, no language) rules get applyTo: "**"
 *   prompt → .github/prompts/<slug>.prompt.md  (Copilot prompt file; NOT a "command" — that is
 *             Claude Code vocabulary only)
 *
 * Key per-AI artifact vocabulary:
 *   - GitHub Copilot has NO "command" artifact. "/name" is only the invocation UI.
 *   - Claude Code has NO "prompt" artifact. Catalog `prompt` → custom command on Claude.
 *   - Both platforms share the Agent Skills open standard for `skill` (agentskills.io).
 *
 * NOTE on prompt files: `applyTo` is NOT valid frontmatter for .prompt.md — it belongs
 * only in .instructions.md. The current `agent:` field replaces the legacy `mode:`.
 * NOTE on skill SKILL.md: frontmatter uses `name`/`description` only — NO `applyTo`/`paths`
 * (skills load by description relevance in Copilot, not by file-path matching).
 * NOTE on agents: `.agent.md` extension and `description` frontmatter are required by the
 * official Copilot spec. `build` emits the aggregate AGENTS.md (cross-tool open standard).
 */
import type {
  Target,
  ResolvedCatalog,
  ResolvedArtifact,
  FileMap,
  CompileOptions,
  ScaffoldOptions,
  ArtifactKind,
  KindVocabulary,
  ContractEntry,
} from '../../types';
import { yamlScalar } from '../yaml-util';
import { toCopilotPlaceholders } from '../prompt-args';

export class CopilotTarget implements Target {
  readonly name = 'copilot';

  /**
   * All four basic kinds are supported — skills to .github/skills/ (Agent Skills open standard),
   * rules to .github/instructions/, prompts to .github/prompts/, agents to .github/agents/.
   */
  readonly supportedKinds: ArtifactKind[] = ['skill', 'agent', 'rule', 'prompt'];

  /**
   * GitHub Copilot's native artifact vocabulary (verified June 2026).
   * A catalog `rule` maps to *instructions* on Copilot — "rule" is not a Copilot term.
   * A catalog `prompt` maps to a *prompt file* — "command" is not a Copilot artifact type.
   * Both platforms share the Agent Skills open standard for `skill`.
   */
  readonly vocabulary: Partial<Record<ArtifactKind, KindVocabulary>> = {
    skill: {
      noun: 'skill',
      plural: 'Skills',
      hint: 'Agent Skills (open standard, agentskills.io)',
    },
    agent: {
      noun: 'agent',
      plural: 'Agents',
      hint: 'custom agents (invoked as @name in Copilot Chat)',
    },
    rule: {
      noun: 'instructions',
      plural: 'Instructions',
      hint: 'coding guidelines (.instructions.md with applyTo)',
    },
    prompt: {
      noun: 'prompt',
      plural: 'Prompts',
      hint: 'prompt files invoked as /name in Copilot Chat',
    },
    workflow: { noun: 'prompt', plural: 'Prompts', hint: 'multi-step workflows as prompt files' },
  };

  /**
   * Output-conformance contracts for Copilot scaffold output.
   * Checked by `build` and `add` after emit to enforce per-AI artifact shapes:
   *   - Copilot prompt files must NOT have `applyTo` (belongs only in .instructions.md)
   *   - Copilot SKILL.md must NOT have `applyTo`/`paths` (skills load by description relevance)
   *   - Prompt files must NOT have unresolved {{…}} — these should be ${input:name}
   */
  readonly outputContracts: ContractEntry[] = [
    {
      // Prompt file: agent + description required; no skill/Claude/instructions fields.
      match: /\.github\/prompts\/.*\.prompt\.md$/,
      label: 'Copilot prompt file',
      contract: {
        requiredKeys: ['agent', 'description'],
        forbiddenKeys: ['applyTo', 'name', 'paths', 'arguments', 'argument-hint'],
        bodyForbids: [
          {
            pattern: /\{\{/,
            reason: 'unresolved {{…}} placeholder (should be translated to ${input:name})',
          },
        ],
      },
    },
    {
      // Agent Skill (open standard): name + description only; no path-matching fields.
      match: /\.github\/skills\/.*\/SKILL\.md$/,
      label: 'Copilot Agent Skill',
      contract: {
        requiredKeys: ['name', 'description'],
        // applyTo and paths: are Claude/instructions fields — Copilot skills load by description relevance
        forbiddenKeys: ['applyTo', 'paths', 'agent'],
      },
    },
    {
      // Instructions file: applyTo required; no agent or name fields.
      match: /\.github\/instructions\/.*\.instructions\.md$/,
      label: 'Copilot instructions',
      contract: {
        requiredKeys: ['applyTo'],
        forbiddenKeys: ['name', 'agent'],
      },
    },
    {
      // Agent: name + description required; no path-matching or prompt fields.
      match: /\.github\/agents\/.*\.agent\.md$/,
      label: 'Copilot agent',
      contract: {
        requiredKeys: ['name', 'description'],
        forbiddenKeys: ['applyTo'],
      },
    },
  ];

  // ── Full build ─────────────────────────────────────────────────────────────

  async compile(catalog: ResolvedCatalog, _options: CompileOptions): Promise<FileMap> {
    const files: FileMap = {};

    const rules = catalog.artifacts.filter(a => a.kind === 'rule');
    const skills = catalog.artifacts.filter(a => a.kind === 'skill');
    const agents = catalog.artifacts.filter(a => a.kind === 'agent');
    const prompts = catalog.artifacts.filter(a => a.kind === 'prompt');

    // ── copilot-instructions.md: baseline shared rules ─────────────────────
    const sharedRules = rules.filter(r => !r.frontmatter.language);
    if (sharedRules.length > 0) {
      files['.github/copilot-instructions.md'] = this.buildCopilotInstructions(sharedRules);
    }

    // ── instructions/*.instructions.md: language-specific rules ───────────
    const languageRules = rules.filter(r => r.frontmatter.language);
    for (const rule of languageRules) {
      const slug = rule.id.replace(/\//g, '-');
      files[`.github/instructions/${slug}.instructions.md`] = this.buildInstructionsFile(rule);
    }

    // ── skills/*/SKILL.md: native Agent Skills (open standard) ───────────
    for (const skill of skills) {
      const name = skill.frontmatter.name as string;
      files[`.github/skills/${name}/SKILL.md`] = this.buildSkillMd(skill);
      // Write supporting files (references) alongside SKILL.md — fixes the previous
      // prompt-file path that silently dropped all skill.references.
      for (const ref of skill.references ?? []) {
        files[`.github/skills/${name}/references/${ref.name}`] = ref.content;
      }
    }

    // ── prompts/*.prompt.md: standalone prompts only ──────────────────────
    for (const prompt of prompts) {
      const slug = prompt.id.replace(/\//g, '-');
      files[`.github/prompts/${slug}.prompt.md`] = this.buildPromptFile(prompt);
    }

    // ── AGENTS.md ──────────────────────────────────────────────────────────
    if (agents.length > 0) {
      files['.github/AGENTS.md'] = this.buildAgentsMd(agents);
    }

    return files;
  }

  // ── Scaffold (add command) ─────────────────────────────────────────────────

  async scaffold(
    artifactId: string,
    catalog: ResolvedCatalog,
    options: ScaffoldOptions,
  ): Promise<FileMap> {
    const artifact = catalog.byId.get(artifactId);
    if (!artifact) {
      throw new Error(`Artifact '${artifactId}' not found in the catalog`);
    }

    const files: FileMap = {};

    switch (artifact.kind) {
      case 'skill':
        this.scaffoldSkill(artifact, catalog, files, options);
        break;
      case 'agent':
        this.scaffoldAgent(artifact, files);
        break;
      case 'rule':
        this.scaffoldRule(artifact, files);
        break;
      case 'prompt':
        this.scaffoldPrompt(artifact, files);
        break;
      default:
        throw new Error(`Scaffolding not supported for kind '${artifact.kind}'`);
    }

    return files;
  }

  // ── Private: scaffold helpers ──────────────────────────────────────────────

  private scaffoldSkill(
    skill: ResolvedArtifact,
    catalog: ResolvedCatalog,
    files: FileMap,
    options: ScaffoldOptions,
  ): void {
    const name = skill.frontmatter.name as string;
    // Emit as a native Agent Skill (open standard) — not a prompt file.
    files[`.github/skills/${name}/SKILL.md`] = this.buildSkillMd(skill);
    for (const ref of skill.references ?? []) {
      files[`.github/skills/${name}/references/${ref.name}`] = ref.content;
    }

    // Write dependency closure unless --no-deps was requested.
    if (options.includeDeps !== false) {
      for (const rule of skill.resolvedRules ?? []) {
        this.scaffoldRule(rule, files);
      }
      for (const agentId of skill.resolvedAgentIds ?? []) {
        const agent = catalog.byId.get(agentId);
        if (agent) this.scaffoldAgent(agent, files);
      }
    }
  }

  /**
   * Rules scaffold to .github/instructions/<slug>.instructions.md.
   * Shared (no language) rules get applyTo: "**" instead of language-specific globs.
   */
  private scaffoldRule(rule: ResolvedArtifact, files: FileMap): void {
    const slug = rule.id.replace(/\//g, '-');
    files[`.github/instructions/${slug}.instructions.md`] = this.buildInstructionsFile(rule);
  }

  /**
   * Agents scaffold to .github/agents/<name>.agent.md (per-file, incrementally safe).
   * The `.agent.md` extension and the `description` frontmatter field are both required
   * by the official GitHub Copilot custom agent specification.
   * See: docs.github.com/.../custom-agents-configuration
   *
   * The full `build` command produces the aggregated .github/AGENTS.md (open standard).
   */
  private scaffoldAgent(agent: ResolvedArtifact, files: FileMap): void {
    const name = agent.frontmatter.name as string;
    const title = agent.frontmatter.title as string;
    const description = agent.frontmatter.description as string;

    const frontmatter = [
      '---',
      `name: ${name}`,
      `description: ${yamlScalar(description)}`,
      '---',
      '',
    ].join('\n');

    files[`.github/agents/${name}.agent.md`] = [frontmatter, `# ${title}`, '', agent.body, ''].join(
      '\n',
    );
  }

  private scaffoldPrompt(prompt: ResolvedArtifact, files: FileMap): void {
    const slug = prompt.id.replace(/\//g, '-');
    files[`.github/prompts/${slug}.prompt.md`] = this.buildPromptFile(prompt);
  }

  // ── Private: build helpers ─────────────────────────────────────────────────

  /** Builds .github/copilot-instructions.md from shared (cross-language) rules. */
  private buildCopilotInstructions(sharedRules: ResolvedArtifact[]): string {
    const sections = sharedRules.map(rule => {
      const title = rule.frontmatter.title as string;
      return `## ${title}\n\n${rule.resolvedBody ?? rule.body}`;
    });

    return [
      '# Copilot Instructions',
      '',
      '<!-- Generated by sigil. Edit source in catalog/shared/rules/. -->',
      '<!-- These rules apply to every file in this repository. -->',
      '',
      ...sections,
      '',
    ].join('\n');
  }

  /**
   * Builds a .github/instructions/<slug>.instructions.md for a language-specific rule.
   * Shared rules (no language) get applyTo: "**" so they apply to every file.
   * The applyTo frontmatter field uses Copilot's comma-separated glob syntax.
   */
  private buildInstructionsFile(rule: ResolvedArtifact): string {
    const hasLanguage = Boolean(rule.frontmatter.language);
    const appliesTo = hasLanguage
      ? ((rule.frontmatter.appliesTo as string[] | undefined) ?? ['**/*'])
      : ['**'];
    const applyToValue = appliesTo.join(',');

    const frontmatter = ['---', `applyTo: "${applyToValue}"`, '---'].join('\n');

    const title = rule.frontmatter.title as string;
    const body = rule.resolvedBody ?? rule.body;
    const sourceComment = hasLanguage
      ? `<!-- Generated by sigil — source: catalog/${rule.id}.rule.md -->`
      : `<!-- Generated by sigil — source: catalog/shared/rules/. -->`;

    return [frontmatter, '', `# ${title}`, '', sourceComment, '', body, ''].join('\n');
  }

  /**
   * Builds a .github/skills/<name>/SKILL.md for the native Agent Skills open standard.
   *
   * Frontmatter uses only `name` and `description` — NO `applyTo`/`paths`, because Copilot
   * skills load by description relevance rather than file-path matching.
   * Resolved rule bodies are inlined under "## Coding guidelines to apply" so the skill
   * stays self-contained even when installed with --no-deps.
   */
  private buildSkillMd(skill: ResolvedArtifact): string {
    const name = skill.frontmatter.name as string;
    const description = skill.frontmatter.description as string;

    const frontmatter = [
      '---',
      `name: ${name}`,
      `description: ${yamlScalar(description)}`,
      '---',
    ].join('\n');

    const parts = [frontmatter, '', skill.body];

    const rules = skill.resolvedRules ?? [];
    if (rules.length > 0) {
      parts.push('', '---', '', '## Coding guidelines to apply', '');
      for (const rule of rules) {
        const ruleTitle = rule.frontmatter.title as string;
        parts.push(`### ${ruleTitle}`, '', rule.resolvedBody ?? rule.body, '');
      }
    }

    return parts.join('\n').trimEnd() + '\n';
  }

  /**
   * Builds a .github/prompts/<slug>.prompt.md for a standalone catalog `prompt`.
   *
   * Copilot prompt files use YAML frontmatter (agent, description, tools) and are invoked
   * as /name in Copilot Chat. Note: "prompt file" is Copilot's native term — Claude Code
   * calls the equivalent artifact a "custom command" (no "prompt" artifact type there).
   *
   * `applyTo` is NOT valid inside .prompt.md — it belongs only in .instructions.md.
   * `agent:` is the current field name (renamed from `mode:` in recent Copilot docs).
   * `{{name}}` placeholders in the body are translated to `${input:name}` (VS Code input
   * variable syntax). The 2-part form is used deliberately — 3-part `${input:name:placeholder}`
   * breaks when the description contains a colon (e.g. "Options: reviewer, junior").
   */
  private buildPromptFile(prompt: ResolvedArtifact): string {
    const description = prompt.frontmatter.description as string;

    const frontmatterLines = [
      '---',
      'agent: agent',
      `description: ${yamlScalar(description)}`,
      'tools:',
      '  - codebase',
      '  - github',
      '---',
    ];

    const parts = [frontmatterLines.join('\n'), '', toCopilotPlaceholders(prompt.body)];

    return parts.join('\n').trimEnd() + '\n';
  }

  /**
   * Builds .github/AGENTS.md — a single file listing all agents.
   * Copilot reads this to surface custom agent modes.
   */
  private buildAgentsMd(agents: ResolvedArtifact[]): string {
    const sections = agents.map(agent => {
      const name = agent.frontmatter.name as string;
      const title = agent.frontmatter.title as string;
      const description = agent.frontmatter.description as string;
      return [`## ${name}`, '', `**${title}**`, '', description, '', agent.body].join('\n');
    });

    return (
      [
        '# AI Agents',
        '',
        '<!-- Generated by sigil. Edit source in catalog/*/agents/. -->',
        '<!-- Use these agents in GitHub Copilot Chat by invoking their @name. -->',
        '',
        ...sections,
      ]
        .join('\n')
        .trimEnd() + '\n'
    );
  }
}
