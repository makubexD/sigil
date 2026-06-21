/**
 * GitHub Copilot target adapter.
 *
 * Full build (compile): emits the .github/ directory layout that Copilot reads natively.
 *   dist/copilot/
 *     .github/
 *       copilot-instructions.md           ← shared baseline rules (apply to all files)
 *       instructions/
 *         <lang>-style.instructions.md    ← language-specific rules with applyTo globs
 *       prompts/
 *         <skill-name>.prompt.md          ← skills as /prompt-name commands in Copilot Chat
 *       AGENTS.md                         ← all agents declared in one file
 *
 * Scaffold (add): emits per-artifact files — never clobbers an aggregate file.
 *   .github/
 *     instructions/<slug>.instructions.md  ← language rule, or shared rule with applyTo: "**"
 *     prompts/<name>.prompt.md             ← skill or prompt
 *     agents/<name>.md                     ← one file per agent
 *
 * Mapping from canonical → Copilot:
 *   skill  → .github/prompts/<name>.prompt.md    (mode: agent, triggered by /name)
 *   agent  → .github/agents/<name>.md            (per-file in scaffold; AGENTS.md in build)
 *   rule   → .github/instructions/<id>.instructions.md (applyTo from canonicalAppliesTo)
 *             Baseline (shared, no language) rules get applyTo: "**"
 *   prompt → .github/prompts/<name>.prompt.md
 *
 * NOTE on agents: the scaffold path writes to .github/agents/<name>.md (per-file).
 * If this path is not yet supported by your Copilot version, copy the files to AGENTS.md
 * manually, or use `build --target copilot` which always produces the aggregate AGENTS.md.
 */
import type {
  Target,
  ResolvedCatalog,
  ResolvedArtifact,
  FileMap,
  CompileOptions,
  ScaffoldOptions,
  ArtifactKind,
} from '../../types';

export class CopilotTarget implements Target {
  readonly name = 'copilot';

  /**
   * All four basic kinds are supported — rules map to .github/instructions/,
   * skills/prompts to .github/prompts/, agents to .github/agents/.
   */
  readonly supportedKinds: ArtifactKind[] = ['skill', 'agent', 'rule', 'prompt'];

  // ── Full build ─────────────────────────────────────────────────────────────

  async compile(catalog: ResolvedCatalog, _options: CompileOptions): Promise<FileMap> {
    const files: FileMap = {};

    const rules    = catalog.artifacts.filter(a => a.kind === 'rule');
    const skills   = catalog.artifacts.filter(a => a.kind === 'skill');
    const agents   = catalog.artifacts.filter(a => a.kind === 'agent');
    const prompts  = catalog.artifacts.filter(a => a.kind === 'prompt');

    // ── copilot-instructions.md: baseline shared rules ─────────────────────
    const sharedRules = rules.filter(r => !r.frontmatter.language);
    if (sharedRules.length > 0) {
      files['.github/copilot-instructions.md'] = this.buildCopilotInstructions(sharedRules);
    }

    // ── instructions/*.instructions.md: language-specific rules ───────────
    const languageRules = rules.filter(r => r.frontmatter.language);
    for (const rule of languageRules) {
      const slug = rule.id.replace(/\//g, '-');
      files[`.github/instructions/${slug}.instructions.md`] =
        this.buildInstructionsFile(rule);
    }

    // ── prompts/*.prompt.md: skills ────────────────────────────────────────
    for (const skill of skills) {
      const name = skill.frontmatter.name as string;
      files[`.github/prompts/${name}.prompt.md`] = this.buildPromptFile(skill);
    }

    // ── prompts/*.prompt.md: standalone prompts ────────────────────────────
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
    files[`.github/prompts/${name}.prompt.md`] = this.buildPromptFile(skill);

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
    files[`.github/instructions/${slug}.instructions.md`] =
      this.buildInstructionsFile(rule);
  }

  /**
   * Agents scaffold to .github/agents/<name>.md (per-file, incrementally safe).
   * The full `build` command produces the aggregated .github/AGENTS.md.
   */
  private scaffoldAgent(agent: ResolvedArtifact, files: FileMap): void {
    const name = agent.frontmatter.name as string;
    const title = agent.frontmatter.title as string;
    const description = agent.frontmatter.description as string;
    files[`.github/agents/${name}.md`] = [
      `# ${title}`,
      '',
      description,
      '',
      agent.body,
      '',
    ].join('\n');
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
      '<!-- Generated by @maku/agent-catalog. Edit source in catalog/shared/rules/. -->',
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
      ? (rule.frontmatter.appliesTo as string[] | undefined) ?? ['**/*']
      : ['**'];
    const applyToValue = appliesTo.join(',');

    const frontmatter = [
      '---',
      `applyTo: "${applyToValue}"`,
      '---',
    ].join('\n');

    const title = rule.frontmatter.title as string;
    const body = rule.resolvedBody ?? rule.body;
    const sourceComment = hasLanguage
      ? `<!-- Generated by @maku/agent-catalog — source: catalog/${rule.id}.rule.md -->`
      : `<!-- Generated by @maku/agent-catalog — source: catalog/shared/rules/. -->`;

    return [
      frontmatter,
      '',
      `# ${title}`,
      '',
      sourceComment,
      '',
      body,
      '',
    ].join('\n');
  }

  /**
   * Builds a .github/prompts/*.prompt.md from a skill or standalone prompt.
   * Copilot prompt files use YAML frontmatter (mode, description, tools).
   */
  private buildPromptFile(artifact: ResolvedArtifact): string {
    const description = artifact.frontmatter.description as string;
    const appliesTo = artifact.frontmatter.appliesTo as string[] | undefined;

    const frontmatterLines = [
      '---',
      'mode: agent',
      `description: >-`,
      `  ${description}`,
      'tools:',
      '  - codebase',
      '  - github',
    ];

    if (appliesTo && appliesTo.length > 0) {
      // Copilot uses applyTo in prompt files to suggest when the prompt is relevant
      frontmatterLines.push(`applyTo: "${appliesTo.join(',')}"`);
    }
    frontmatterLines.push('---');

    // For skills: inline the resolved rule guidance as a context section
    const parts = [frontmatterLines.join('\n'), ''];

    if (artifact.kind === 'skill') {
      parts.push(artifact.body);

      const rules = artifact.resolvedRules ?? [];
      if (rules.length > 0) {
        parts.push('', '---', '', '## Coding guidelines to apply', '');
        for (const rule of rules) {
          const ruleTitle = rule.frontmatter.title as string;
          parts.push(`### ${ruleTitle}`, '', rule.resolvedBody ?? rule.body, '');
        }
      }
    } else {
      parts.push(artifact.body);
    }

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
      return [
        `## ${name}`,
        '',
        `**${title}**`,
        '',
        description,
        '',
        agent.body,
      ].join('\n');
    });

    return [
      '# AI Agents',
      '',
      '<!-- Generated by @maku/agent-catalog. Edit source in catalog/*/agents/. -->',
      '<!-- Use these agents in GitHub Copilot Chat by invoking their @name. -->',
      '',
      ...sections,
    ].join('\n').trimEnd() + '\n';
  }
}
