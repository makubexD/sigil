/**
 * Scaffold helpers for the GitHub Copilot target.
 *
 * Writes into the consumer's .github/ directory (per-artifact, never clobbers aggregates).
 *   .github/
 *     skills/<name>/SKILL.md
 *     skills/<name>/references/<file>
 *     instructions/<slug>.instructions.md
 *     prompts/<slug>.prompt.md
 *     agents/<name>.agent.md
 */
import type { ResolvedArtifact, ResolvedCatalog, FileMap, ScaffoldOptions } from '../../types';
import { buildInstructionsFile, buildSkillMd, buildPromptFile } from './build-helpers';
import { SKILL_FILENAME } from '../../paths';
import { renderArtifact } from '../emit';
import { COPILOT_AGENT_SPEC } from './spec/agent';

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
  const name = skill.frontmatter.name as string;
  // Emit as a native Agent Skill (open standard) — not a prompt file.
  files[`.github/skills/${name}/${SKILL_FILENAME}`] = buildSkillMd(skill);
  for (const ref of skill.references ?? []) {
    files[`.github/skills/${name}/references/${ref.name}`] = ref.content;
  }

  scaffoldSkillDeps(skill, catalog, files, options);
}

/**
 * Rules scaffold to .github/instructions/<slug>.instructions.md.
 * Shared (no language) rules get applyTo: "**" instead of language-specific globs.
 */
export function scaffoldRule(rule: ResolvedArtifact, files: FileMap): void {
  const slug = rule.id.replace(/\//g, '-');
  files[`.github/instructions/${slug}.instructions.md`] = buildInstructionsFile(rule);
}

/**
 * Agents scaffold to .github/agents/<name>.agent.md (per-file, incrementally safe).
 *
 * The `.agent.md` extension and the `description` frontmatter field are both required
 * by the official GitHub Copilot custom agent specification (see spec/agent.ts's docs).
 *
 * The full `build` command produces the aggregated .github/AGENTS.md (open standard).
 *
 * When `catalog` and `installSet` are provided, a `## Boundary` section is conditionally
 * rendered before the agent body — only for `relatedArtifacts` entries co-present in
 * `installSet`. This avoids dangling references to uninstalled agents.
 *
 * Delegates to the declarative spec in `spec/agent.ts` — see spec-types.ts for why the format
 * knowledge lives there rather than here.
 */
export function scaffoldAgent(
  agent: ResolvedArtifact,
  files: FileMap,
  catalog?: ResolvedCatalog,
  installSet?: Set<string>,
): void {
  const name = agent.frontmatter.name as string;
  files[`.github/agents/${name}.agent.md`] = renderArtifact(COPILOT_AGENT_SPEC, agent, {
    catalog,
    installSet,
  });
}

export function scaffoldPrompt(prompt: ResolvedArtifact, files: FileMap): void {
  const slug = prompt.id.replace(/\//g, '-');
  files[`.github/prompts/${slug}.prompt.md`] = buildPromptFile(prompt);
}

export function scaffoldWorkflow(workflow: ResolvedArtifact, files: FileMap): void {
  // Copilot has no native workflow type — emit as a prompt file so it's invocable as /name.
  const slug = workflow.id.replace(/\//g, '-');
  files[`.github/prompts/${slug}.prompt.md`] = buildPromptFile(workflow);
}
