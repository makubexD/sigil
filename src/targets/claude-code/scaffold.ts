/**
 * Scaffold helpers for the Claude Code `sigil add` path.
 *
 * Writes into the consumer's .claude/ directory using Claude Code's
 * native project-scope layout, where rules are first-class (.claude/rules/*.md).
 *
 *   .claude/
 *     skills/<skill-name>/SKILL.md      ← includes prompt/workflow kinds (disable-model-invocation)
 *     rules/<rule-name>.md
 *     agents/<agent-name>.md
 */
import type { ResolvedArtifact, ResolvedCatalog, FileMap, ScaffoldOptions } from '../../types';
import { buildPluginSkillMd, buildAgentMd } from './plugin-build';
import { SKILL_FILENAME } from '../../paths';
import { renderArtifact } from '../emit';
import { CLAUDE_SCAFFOLD_RULE_SPEC } from './spec/rule';
import { CLAUDE_PROMPT_SPEC } from './spec/prompt';
import { CLAUDE_WORKFLOW_SPEC } from './spec/workflow';

/** Scaffolds a skill's rule/agent dependency closure, unless --no-deps was requested. */
function scaffoldSkillDeps(
  skill: ResolvedArtifact,
  catalog: ResolvedCatalog,
  files: FileMap,
  options: ScaffoldOptions,
): void {
  if (options.includeDeps === false) return;
  for (const rule of skill.resolvedRules ?? []) {
    scaffoldRule(rule, files);
  }
  for (const agentId of skill.resolvedAgentIds ?? []) {
    const agent = catalog.byId.get(agentId);
    if (agent) scaffoldAgent(agent, files, catalog, options.coInstallSet);
  }
}

export function scaffoldSkill(
  skill: ResolvedArtifact,
  catalog: ResolvedCatalog,
  files: FileMap,
  options: ScaffoldOptions,
): void {
  const skillName = skill.frontmatter.name as string;

  // The scaffolded SKILL.md reuses the plugin layout (name/description/when_to_use/
  // allowed-tools/argument-hint). Rules are NOT inlined (inlineRules: false) — this is
  // the CLI scaffold path, and .claude/rules/*.md are loaded natively by Claude Code.
  files[`.claude/skills/${skillName}/${SKILL_FILENAME}`] = buildPluginSkillMd(
    skill,
    false,
    catalog,
    options.coInstallSet,
  );

  for (const ref of skill.references ?? []) {
    files[`.claude/skills/${skillName}/references/${ref.name}`] = ref.content;
  }

  scaffoldSkillDeps(skill, catalog, files, options);
}

/**
 * Any rule with an authored `appliesTo` gets a `paths:` frontmatter block so Claude Code loads
 * it only when editing matching files — language and shared rules alike (shared/clean-code
 * declares `appliesTo: ["**\/*"]` just like a language rule does). Only a rule with no
 * `appliesTo` at all has no frontmatter and loads unconditionally.
 * (Plugin-build mode never writes standalone rule files — it inlines resolvedBody into the
 * skill's "## Applied Rules" section instead, so there is no second `paths:` site to keep in
 * sync for rules specifically.) Delegates to the declarative spec in `spec/rule.ts`.
 */
export function scaffoldRule(rule: ResolvedArtifact, files: FileMap): void {
  const slug = rule.id.replace(/\//g, '-');
  files[`.claude/rules/${slug}.md`] = renderArtifact(CLAUDE_SCAFFOLD_RULE_SPEC, rule, {});
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

/**
 * `description:` feeds the `/` menu label in Claude Code. `argument-hint:` shows the
 * autocomplete hint (e.g. "[diff] [audience]"). `arguments:` declares named positional args so
 * `$name` substitution resolves. `disable-model-invocation: true` keeps it user-invoked only, same
 * as the retired `.claude/commands/` format. Delegates to the declarative spec in `spec/prompt.ts`.
 */
export function scaffoldPrompt(prompt: ResolvedArtifact, files: FileMap): void {
  const slug = prompt.id.replace(/\//g, '-');
  files[`.claude/skills/${slug}/${SKILL_FILENAME}`] = renderArtifact(
    CLAUDE_PROMPT_SPEC,
    prompt,
    {},
  );
}

export function scaffoldWorkflow(workflow: ResolvedArtifact, files: FileMap): void {
  const slug = workflow.id.replace(/\//g, '-');
  files[`.claude/skills/${slug}/${SKILL_FILENAME}`] = renderArtifact(
    CLAUDE_WORKFLOW_SPEC,
    workflow,
    {},
  );
}
