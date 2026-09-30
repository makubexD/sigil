/**
 * Scaffold helpers for the Claude Code `sigil add` path.
 *
 * Writes into the consumer's .claude/ directory using Claude Code's
 * native project-scope layout, where rules are first-class (.claude/rules/*.md).
 *
 *   .claude/
 *     skills/<skill-name>/SKILL.md
 *     rules/<rule-name>.md
 *     agents/<agent-name>.md
 *     commands/<slug>.md
 */
import type { ResolvedArtifact, ResolvedCatalog, FileMap, ScaffoldOptions } from '../../types';
import type { PromptArg } from '../prompt-args';
import { yamlScalar } from '../yaml-util';
import { toClaudePlaceholders, buildArgumentHint } from '../prompt-args';
import { buildPluginSkillMd, buildAgentMd, buildWorkflowMd } from './plugin-build';

export function scaffoldSkill(
  skill: ResolvedArtifact,
  catalog: ResolvedCatalog,
  files: FileMap,
  options: ScaffoldOptions,
): void {
  const skillName = skill.frontmatter.name as string;

  // The scaffolded SKILL.md reuses the plugin layout (paths + allowed-tools + argument-hint).
  // Rules are NOT inlined — .claude/rules/*.md are loaded natively by Claude Code.
  files[`.claude/skills/${skillName}/SKILL.md`] = buildPluginSkillMd(skill);

  for (const ref of skill.references ?? []) {
    files[`.claude/skills/${skillName}/references/${ref.name}`] = ref.content;
  }

  // Write dependency closure unless --no-deps was requested
  if (options.includeDeps !== false) {
    for (const rule of skill.resolvedRules ?? []) {
      scaffoldRule(rule, files);
    }
    for (const agentId of skill.resolvedAgentIds ?? []) {
      const agent = catalog.byId.get(agentId);
      if (agent) scaffoldAgent(agent, files, catalog, options.coInstallSet);
    }
  }
}

export function scaffoldRule(rule: ResolvedArtifact, files: FileMap): void {
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

export function scaffoldAgent(
  agent: ResolvedArtifact,
  files: FileMap,
  catalog?: ResolvedCatalog,
  installSet?: Set<string>,
): void {
  const agentName = agent.frontmatter.name as string;
  files[`.claude/agents/${agentName}.md`] = buildAgentMd(agent, catalog, installSet);
}

export function scaffoldPrompt(prompt: ResolvedArtifact, files: FileMap): void {
  const slug = prompt.id.replace(/\//g, '-');
  const title = prompt.frontmatter.title as string;
  const description = prompt.frontmatter.description as string;
  const args = (prompt.frontmatter.args as PromptArg[] | undefined) ?? [];

  // `description:` feeds the `/` menu label in Claude Code.
  // `argument-hint:` shows autocomplete hint (e.g. "[diff] [audience]").
  // `arguments:` declares named positional args so `$name` substitution resolves.
  const fmLines: string[] = ['---', `description: ${yamlScalar(description)}`];
  if (args.length > 0) {
    // Quote the argument-hint value — bare square brackets like [diff] [audience] are
    // invalid YAML flow-sequence syntax without quoting.
    fmLines.push(`argument-hint: "${buildArgumentHint(args)}"`);
    fmLines.push('arguments:');
    for (const arg of args) {
      fmLines.push(`  - ${arg.name}`);
    }
  }
  fmLines.push('---');

  // Translate {{name}} placeholders → $name (Claude's $name substitution syntax).
  const body = toClaudePlaceholders(prompt.body);

  files[`.claude/commands/${slug}.md`] = [
    fmLines.join('\n'),
    '',
    `# ${title}`,
    '',
    body,
    '',
  ].join('\n');
}

export function scaffoldWorkflow(workflow: ResolvedArtifact, files: FileMap): void {
  const slug = workflow.id.replace(/\//g, '-');
  files[`.claude/commands/${slug}.md`] = buildWorkflowMd(workflow);
}
