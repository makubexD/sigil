/**
 * Claude Code target adapter.
 *
 * Full build (compile): generates a git-based marketplace layout under dist/claude/.
 *   dist/claude/
 *     .claude-plugin/marketplace.json     ← /plugin marketplace add ./dist/claude
 *     plugins/
 *       <pack-name>/
 *         .claude-plugin/plugin.json
 *         skills/<skill-name>/SKILL.md    ← rule bodies inlined as "## Applied Rules"
 *         agents/<agent-name>.md          ← claude: frontmatter applied
 *
 * Scaffold (add): writes into the consumer's .claude/ directory using Claude Code's
 *   native project-scope layout, where rules are first-class (.claude/rules/*.md).
 *   .claude/
 *     skills/<skill-name>/SKILL.md
 *     rules/<rule-name>.md
 *     agents/<agent-name>.md
 *
 * NOTE on rules in plugin build vs. scaffold:
 *   Claude Code plugins cannot ship loose rules — they only load context via skills/agents/hooks.
 *   So in the plugin build we fold rule bodies into the skill's SKILL.md.
 *   In the scaffold build we write rules to .claude/rules/*.md, which Claude Code loads natively.
 */
import path from 'path';
import type {
  Target,
  ResolvedCatalog,
  ResolvedArtifact,
  FileMap,
  CompileOptions,
  ScaffoldOptions,
  Pack,
  ArtifactKind,
} from '../../types';
import type { AgentFrontmatter } from '../../schema';
import { yamlScalar } from '../yaml-util';

export class ClaudeCodeTarget implements Target {
  readonly name = 'claude';

  /**
   * Artifact kinds this target can scaffold via `add`.
   * `workflow` is intentionally absent — no scaffold shape defined yet.
   */
  readonly supportedKinds: ArtifactKind[] = ['skill', 'agent', 'rule', 'prompt'];

  // ── Full build ─────────────────────────────────────────────────────────────

  async compile(catalog: ResolvedCatalog, options: CompileOptions): Promise<FileMap> {
    const files: FileMap = {};

    // Collect per-pack plugin entries for marketplace.json
    const pluginEntries: Array<{
      name: string;
      displayName: string;
      description: string;
      source: string;
    }> = [];

    for (const pack of options.packs) {
      const packArtifacts = this.getPackArtifacts(pack, catalog);
      const pluginFiles = this.buildPlugin(pack, packArtifacts, catalog, options.version);
      Object.assign(files, pluginFiles);

      pluginEntries.push({
        name: pack.name,
        displayName: pack.displayName,
        description: pack.description,
        source: `./plugins/${pack.name}`,
      });
    }

    // marketplace.json — flat top-level schema (name / owner / plugins[])
    // See: code.claude.com/docs/en/plugin-marketplaces
    files['.claude-plugin/marketplace.json'] = JSON.stringify(
      {
        name: 'maku-catalog',
        owner: {
          name: 'Maku Agent Catalog',
          url: 'https://github.com/maku/agent-catalog',
        },
        description: 'Vendor-neutral AI skills, agents, and rules for multiple languages.',
        plugins: pluginEntries,
      },
      null,
      2,
    ) + '\n';

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

  // ── Private: plugin build helpers ─────────────────────────────────────────

  private getPackArtifacts(pack: Pack, catalog: ResolvedCatalog): ResolvedArtifact[] {
    if (pack.artifacts && pack.artifacts.length > 0) {
      return pack.artifacts
        .map(id => catalog.byId.get(id))
        .filter((a): a is ResolvedArtifact => a !== undefined);
    }
    // Default: all artifacts whose language matches one of the pack's languages
    const langs = new Set(pack.languages ?? []);
    return catalog.artifacts.filter(a => {
      const lang = a.frontmatter.language as string | undefined;
      return lang !== undefined && langs.has(lang);
    });
  }

  private buildPlugin(
    pack: Pack,
    packArtifacts: ResolvedArtifact[],
    catalog: ResolvedCatalog,
    version: string,
  ): FileMap {
    const files: FileMap = {};
    const prefix = `plugins/${pack.name}`;

    // plugin.json — metadata; version comes from npm package version
    files[`${prefix}/.claude-plugin/plugin.json`] = JSON.stringify(
      {
        $schema: 'https://json.schemastore.org/claude-code-plugin-manifest.json',
        name: pack.name,
        displayName: pack.displayName,
        version,
        description: pack.description,
        author: {
          name: 'Maku Agent Catalog',
          url: 'https://github.com/maku/agent-catalog',
        },
        license: 'MIT',
        keywords: pack.languages ?? [],
      },
      null,
      2,
    ) + '\n';

    const skills = packArtifacts.filter(a => a.kind === 'skill');
    const agents = packArtifacts.filter(a => a.kind === 'agent');

    // Write skills — rule bodies inlined as "## Applied Rules" section
    for (const skill of skills) {
      const skillName = skill.frontmatter.name as string;
      const skillMd = this.buildPluginSkillMd(skill, catalog);
      files[`${prefix}/skills/${skillName}/SKILL.md`] = skillMd;

      // Write reference files alongside the SKILL.md
      for (const ref of skill.references ?? []) {
        files[`${prefix}/skills/${skillName}/references/${ref.name}`] = ref.content;
      }
    }

    // Write agents — apply claude: hints as frontmatter fields
    for (const agent of agents) {
      const agentName = agent.frontmatter.name as string;
      files[`${prefix}/agents/${agentName}.md`] = this.buildAgentMd(agent);
    }

    // Include shared agents referenced by skills in this pack
    const sharedAgentIds = new Set<string>();
    for (const skill of skills) {
      for (const agentId of skill.resolvedAgentIds ?? []) {
        if (!agents.some(a => a.id === agentId)) {
          sharedAgentIds.add(agentId);
        }
      }
    }
    for (const agentId of sharedAgentIds) {
      const agent = catalog.byId.get(agentId);
      if (agent) {
        const agentName = agent.frontmatter.name as string;
        files[`${prefix}/agents/${agentName}.md`] = this.buildAgentMd(agent);
      }
    }

    return files;
  }

  /**
   * Builds a SKILL.md for the Claude plugin.
   * The resolved rule bodies are appended under "## Applied Rules" so the
   * guidance is present in context when the skill fires.
   */
  private buildPluginSkillMd(skill: ResolvedArtifact, _catalog: ResolvedCatalog): string {
    const fm = skill.frontmatter;
    const name = fm.name as string;
    const description = fm.description as string;
    const appliesTo = (fm.appliesTo as string[] | undefined) ?? ['**/*'];

    // `paths:` is the Claude Code–recognized key for path-scoped loading.
    // `appliesTo` is our canonical vendor-neutral field name in catalog source.
    const frontmatter = [
      '---',
      `name: ${name}`,
      `description: ${yamlScalar(description)}`,
      ...(appliesTo.length > 0 ? [`paths:\n${appliesTo.map(g => `  - "${g}"`).join('\n')}`] : []),
      '---',
    ].join('\n');

    const parts = [frontmatter, '', skill.body];

    // Append resolved rule bodies
    const rules = skill.resolvedRules ?? [];
    if (rules.length > 0) {
      parts.push('', '---', '', '## Applied Rules', '');
      for (const rule of rules) {
        const ruleTitle = rule.frontmatter.title as string;
        parts.push(`### ${ruleTitle}`, '', rule.resolvedBody ?? rule.body, '');
      }
    }

    return parts.join('\n').trimEnd() + '\n';
  }

  /** Builds an agent .md file with claude-specific frontmatter applied. */
  private buildAgentMd(agent: ResolvedArtifact): string {
    const fm = agent.frontmatter;
    const claudeHints = (fm.claude as AgentFrontmatter['claude']) ?? {};

    const frontmatterLines = [
      '---',
      `name: ${fm.name}`,
      `description: ${yamlScalar(fm.description as string)}`,
    ];
    if (claudeHints?.model) frontmatterLines.push(`model: ${claudeHints.model}`);
    if (claudeHints?.effort) frontmatterLines.push(`effort: ${claudeHints.effort}`);
    if (claudeHints?.maxTurns) frontmatterLines.push(`maxTurns: ${claudeHints.maxTurns}`);
    if (claudeHints?.isolation) frontmatterLines.push(`isolation: ${claudeHints.isolation}`);

    const disallowed = fm.disallowedTools as string[] | undefined;
    if (disallowed && disallowed.length > 0) {
      frontmatterLines.push(`disallowedTools: ${JSON.stringify(disallowed)}`);
    }
    frontmatterLines.push('---');

    return [frontmatterLines.join('\n'), '', agent.body, ''].join('\n');
  }

  // ── Private: scaffold helpers ──────────────────────────────────────────────

  private scaffoldSkill(
    skill: ResolvedArtifact,
    catalog: ResolvedCatalog,
    files: FileMap,
    options: ScaffoldOptions,
  ): void {
    const skillName = skill.frontmatter.name as string;

    // The scaffolded SKILL.md is the original body — no inlining needed because
    // .claude/rules/*.md are loaded natively by Claude Code.
    files[`.claude/skills/${skillName}/SKILL.md`] = this.buildPluginSkillMd(skill, catalog);

    for (const ref of skill.references ?? []) {
      files[`.claude/skills/${skillName}/references/${ref.name}`] = ref.content;
    }

    // Write dependency closure (rules + agents) unless --no-deps was requested.
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

  private scaffoldRule(rule: ResolvedArtifact, files: FileMap): void {
    const slug = rule.id.replace(/\//g, '-');
    const title = rule.frontmatter.title as string;
    const body = rule.resolvedBody ?? rule.body;

    // Language-scoped rules get a `paths:` frontmatter block so Claude Code loads them
    // only when editing matching files. Shared (no-language) rules have no frontmatter
    // and are loaded unconditionally at session start.
    // `paths:` is the Claude Code–recognized key (see code.claude.com/docs/en/memory).
    const hasLanguage = Boolean(rule.frontmatter.language);
    const appliesTo = (rule.frontmatter.appliesTo as string[] | undefined) ?? [];

    if (hasLanguage && appliesTo.length > 0) {
      const pathsFrontmatter = [
        '---',
        `paths:\n${appliesTo.map(g => `  - "${g}"`).join('\n')}`,
        '---',
        '',
      ].join('\n');
      files[`.claude/rules/${slug}.md`] = `${pathsFrontmatter}# ${title}\n\n${body}\n`;
    } else {
      // Shared rules: no frontmatter — loaded for every session
      files[`.claude/rules/${slug}.md`] = `# ${title}\n\n${body}\n`;
    }
  }

  private scaffoldAgent(agent: ResolvedArtifact, files: FileMap): void {
    const agentName = agent.frontmatter.name as string;
    files[`.claude/agents/${agentName}.md`] = this.buildAgentMd(agent);
  }

  private scaffoldPrompt(prompt: ResolvedArtifact, files: FileMap): void {
    const slug = prompt.id.replace(/\//g, '-');
    files[`.claude/commands/${slug}.md`] = `# ${prompt.frontmatter.title}\n\n${prompt.body}\n`;
  }
}
