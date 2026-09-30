/**
 * Plugin build helpers for the Claude Code full-compile path.
 *
 * These produce the git-based marketplace layout under dist/claude/:
 *   dist/claude/
 *     .claude-plugin/marketplace.json
 *     plugins/<pack-name>/
 *       .claude-plugin/plugin.json
 *       skills/<skill-name>/SKILL.md   ← rule bodies inlined as "## Applied Rules"
 *       agents/<agent-name>.md
 *       commands/<workflow-name>.md
 *
 * Rules are inlined into SKILL.md because Claude Code plugins cannot ship loose rules.
 */
import type { ResolvedCatalog, ResolvedArtifact, FileMap, Pack } from '../../types';
import type { AgentFrontmatter, RelatedArtifact } from '../../schema';
import { yamlScalar } from '../yaml-util';

/**
 * Select the artifacts that belong to a pack.
 *
 * When the pack declares an explicit `artifacts:` list, use that.
 * Otherwise fall back to all catalog artifacts whose language matches
 * one of the pack's declared languages.
 */
export function getPackArtifacts(pack: Pack, catalog: ResolvedCatalog): ResolvedArtifact[] {
  if (pack.artifacts && pack.artifacts.length > 0) {
    return pack.artifacts
      .map(id => catalog.byId.get(id))
      .filter((a): a is ResolvedArtifact => a !== undefined);
  }
  const langs = new Set(pack.languages ?? []);
  return catalog.artifacts.filter(a => {
    const lang = a.frontmatter.language as string | undefined;
    return lang !== undefined && langs.has(lang);
  });
}

/**
 * Build a SKILL.md for the Claude plugin layout.
 *
 * The resolved rule bodies are appended under "## Applied Rules" so
 * the guidance is present in context when the skill fires.
 * This inlining is plugin-build only — in the scaffold path rules are
 * written to .claude/rules/*.md and loaded natively.
 */
export function buildPluginSkillMd(skill: ResolvedArtifact): string {
  const fm = skill.frontmatter;
  const name = fm.name as string;
  const description = fm.description as string;
  const appliesTo = (fm.appliesTo as string[] | undefined) ?? ['**/*'];

  // `paths:` is the Claude Code–recognized key for path-scoped loading.
  const allowedTools = fm.allowedTools as string[] | undefined;
  const argumentHint = fm.argumentHint as string | undefined;
  const disableModelInvocation = fm.disableModelInvocation as boolean | undefined;

  const fmLines = [
    '---',
    `name: ${name}`,
    `description: ${yamlScalar(description)}`,
    ...(appliesTo.length > 0 ? [`paths:\n${appliesTo.map(g => `  - "${g}"`).join('\n')}`] : []),
    ...(allowedTools && allowedTools.length > 0
      ? [`allowed-tools: ${allowedTools.join(', ')}`]
      : []),
    ...(argumentHint ? [`argument-hint: "${argumentHint.replace(/"/g, '\\"')}"`] : []),
    ...(disableModelInvocation ? [`disable-model-invocation: true`] : []),
    '---',
  ];
  const frontmatter = fmLines.join('\n');

  const parts = [frontmatter, '', skill.body];

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

/**
 * Build an agent .md file with claude-specific frontmatter applied.
 *
 * When `catalog` and `installSet` are provided, a `## Boundary` section is
 * conditionally appended before the agent body — only for `relatedArtifacts`
 * entries whose target IDs are co-present in `installSet`. This avoids dangling
 * references to uninstalled agents (the core anti-pattern this design eliminates).
 *
 * When `installSet` is absent (standalone scaffold with no context), the section
 * is omitted entirely. When all related artifacts are absent from `installSet`,
 * the section is also omitted.
 */
export function buildAgentMd(
  agent: ResolvedArtifact,
  catalog?: ResolvedCatalog,
  installSet?: Set<string>,
): string {
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

  // ── Conditional Boundary section ─────────────────────────────────────────────
  // Generate a structured escalation section from relatedArtifacts frontmatter,
  // but only for siblings that are co-present in the install/build set.
  // No installSet → no section (standalone install, can't know what's co-present).
  const boundaryLines: string[] = [];
  if (installSet && catalog) {
    const related = (fm.relatedArtifacts as RelatedArtifact[] | undefined) ?? [];
    // Filter to co-present entries only (excluding self — though self won't be in related)
    const coPresent = related.filter(r => r.id !== agent.id && installSet.has(r.id));

    if (coPresent.length > 0) {
      const escalates = coPresent.filter(r => r.relation === 'escalates-to');
      const complements = coPresent.filter(r => r.relation === 'complements');
      const seeAlso = coPresent.filter(r => r.relation === 'see-also');

      boundaryLines.push('## Boundary', '');

      const formatEntry = (r: RelatedArtifact): string => {
        const sibling = catalog.byId.get(r.id);
        const name = (sibling?.frontmatter.name as string | undefined) ?? r.id.split('/').pop()!;
        const title = (sibling?.frontmatter.title as string | undefined) ?? name;
        return `- **${title}** (\`${name}\`) — ${r.reason}`;
      };

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

  const bodyParts =
    boundaryLines.length > 0
      ? [frontmatterLines.join('\n'), '', ...boundaryLines, agent.body]
      : [frontmatterLines.join('\n'), '', agent.body];

  return bodyParts.join('\n').trimEnd() + '\n';
}

/** Build a workflow as a custom command .md file. */
export function buildWorkflowMd(workflow: ResolvedArtifact): string {
  const fm = workflow.frontmatter;
  const title = fm.title as string;
  const description = fm.description as string;
  const steps = (fm.steps as Array<{ ref: string; description?: string }> | undefined) ?? [];

  const frontmatter = ['---', `description: ${yamlScalar(description)}`, '---'].join('\n');

  const stepsSection =
    steps.length > 0
      ? [
          '',
          '## Steps',
          '',
          ...steps.map(s => `- [ ] \`${s.ref}\`` + (s.description ? ` — ${s.description}` : '')),
        ]
      : [];

  const bodyLines = [workflow.body.trim(), ...stepsSection].filter(l => l !== undefined);

  return [frontmatter, '', `# ${title}`, '', ...bodyLines, ''].join('\n');
}

/**
 * Build all plugin files for a single pack.
 *
 * @param pack           The pack metadata.
 * @param packArtifacts  The artifacts that belong to this pack.
 * @param catalog        Full resolved catalog (for shared-agent lookup).
 * @param version        npm package version (written to plugin.json).
 * @param homepage       Optional URL override for author.url fields.
 */
export function buildPlugin(
  pack: Pack,
  packArtifacts: ResolvedArtifact[],
  catalog: ResolvedCatalog,
  version: string,
  homepage?: string,
): FileMap {
  const files: FileMap = {};
  const prefix = `plugins/${pack.name}`;
  const pluginUrl = homepage ?? 'https://github.com/makubexD/sigil#readme';

  // plugin.json — metadata; version comes from npm package version
  files[`${prefix}/.claude-plugin/plugin.json`] =
    JSON.stringify(
      {
        $schema: 'https://json.schemastore.org/claude-code-plugin-manifest.json',
        name: pack.name,
        displayName: pack.displayName,
        version,
        description: pack.description,
        author: { name: 'Sigil', url: pluginUrl },
        license: 'MIT',
        keywords: pack.languages ?? [],
      },
      null,
      2,
    ) + '\n';

  const skills = packArtifacts.filter(a => a.kind === 'skill');
  const agents = packArtifacts.filter(a => a.kind === 'agent');
  const workflows = packArtifacts.filter(a => a.kind === 'workflow');

  // Build the co-install set for the plugin: pack artifacts + shared agents.
  // Used by buildAgentMd for conditional Boundary section rendering.
  const packInstallSet = new Set<string>(packArtifacts.map(a => a.id));

  // Shared agents referenced by skills — also part of the pack's install set
  const sharedAgentIds = new Set<string>();
  for (const skill of skills) {
    for (const agentId of skill.resolvedAgentIds ?? []) {
      if (!agents.some(a => a.id === agentId)) {
        sharedAgentIds.add(agentId);
        packInstallSet.add(agentId);
      }
    }
  }

  // Workflows → custom commands
  for (const workflow of workflows) {
    const slug = workflow.id.replace(/\//g, '-');
    files[`${prefix}/commands/${slug}.md`] = buildWorkflowMd(workflow);
  }

  // Skills — rule bodies inlined as "## Applied Rules"
  for (const skill of skills) {
    const skillName = skill.frontmatter.name as string;
    files[`${prefix}/skills/${skillName}/SKILL.md`] = buildPluginSkillMd(skill);

    for (const ref of skill.references ?? []) {
      files[`${prefix}/skills/${skillName}/references/${ref.name}`] = ref.content;
    }
  }

  // Agents — claude: frontmatter applied; Boundary section rendered for co-present related artifacts
  for (const agent of agents) {
    const agentName = agent.frontmatter.name as string;
    files[`${prefix}/agents/${agentName}.md`] = buildAgentMd(agent, catalog, packInstallSet);
  }

  for (const agentId of sharedAgentIds) {
    const agent = catalog.byId.get(agentId);
    if (agent) {
      const agentName = agent.frontmatter.name as string;
      files[`${prefix}/agents/${agentName}.md`] = buildAgentMd(agent, catalog, packInstallSet);
    }
  }

  return files;
}
