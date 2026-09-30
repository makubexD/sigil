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
import { yamlScalar } from '../yaml-util';
import { buildInstructionsFile, buildSkillMd, buildPromptFile } from './build-helpers';

export function scaffoldSkill(
  skill: ResolvedArtifact,
  catalog: ResolvedCatalog,
  files: FileMap,
  options: ScaffoldOptions,
): void {
  const name = skill.frontmatter.name as string;
  // Emit as a native Agent Skill (open standard) — not a prompt file.
  files[`.github/skills/${name}/SKILL.md`] = buildSkillMd(skill);
  for (const ref of skill.references ?? []) {
    files[`.github/skills/${name}/references/${ref.name}`] = ref.content;
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
 * by the official GitHub Copilot custom agent specification.
 * See: docs.github.com/.../custom-agents-configuration
 *
 * The full `build` command produces the aggregated .github/AGENTS.md (open standard).
 *
 * When `catalog` and `installSet` are provided, a `## Boundary` section is conditionally
 * rendered before the agent body — only for `relatedArtifacts` entries co-present in
 * `installSet`. This avoids dangling references to uninstalled agents.
 */
export function scaffoldAgent(
  agent: ResolvedArtifact,
  files: FileMap,
  catalog?: ResolvedCatalog,
  installSet?: Set<string>,
): void {
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

  // ── Conditional Boundary section ──────────────────────────────────────────
  const boundaryLines: string[] = [];
  if (installSet && catalog) {
    const related =
      (agent.frontmatter.relatedArtifacts as
        | Array<{ id: string; relation: string; reason: string }>
        | undefined) ?? [];
    const coPresent = related.filter(r => r.id !== agent.id && installSet.has(r.id));

    if (coPresent.length > 0) {
      const escalates = coPresent.filter(r => r.relation === 'escalates-to');
      const complements = coPresent.filter(r => r.relation === 'complements');
      const seeAlso = coPresent.filter(r => r.relation === 'see-also');

      const formatEntry = (r: { id: string; reason: string }): string => {
        const sibling = catalog.byId.get(r.id);
        const sibName = (sibling?.frontmatter.name as string | undefined) ?? r.id.split('/').pop()!;
        const sibTitle = (sibling?.frontmatter.title as string | undefined) ?? sibName;
        return `- **${sibTitle}** (\`${sibName}\`) — ${r.reason}`;
      };

      boundaryLines.push('## Boundary', '');
      if (escalates.length > 0) {
        boundaryLines.push('Delegate specialized work to co-installed agents:');
        boundaryLines.push(...escalates.map(formatEntry));
        if (complements.length > 0 || seeAlso.length > 0) boundaryLines.push('');
      }
      if (complements.length > 0) {
        boundaryLines.push('Related specialists (distinct scope):');
        boundaryLines.push(...complements.map(formatEntry));
        if (seeAlso.length > 0) boundaryLines.push('');
      }
      if (seeAlso.length > 0) {
        boundaryLines.push('See also:');
        boundaryLines.push(...seeAlso.map(formatEntry));
      }
      boundaryLines.push('');
    }
  }

  const bodySection =
    boundaryLines.length > 0 ? [...boundaryLines, agent.body].join('\n') : agent.body;

  files[`.github/agents/${name}.agent.md`] = [frontmatter, `# ${title}`, '', bodySection, ''].join(
    '\n',
  );
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
