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
 *       skills/<workflow-name>/SKILL.md ← disable-model-invocation: true (user-invoked only)
 *
 * Rules are inlined into SKILL.md here because Claude Code plugins cannot ship loose
 * rules. `buildPluginSkillMd`'s `inlineRules` parameter is what this file threads
 * through as `true` — the CLI scaffold path (scaffold.ts) reuses the same builder with
 * `false`, since it writes .claude/rules/*.md files that load natively instead.
 */
import type { ResolvedCatalog, ResolvedArtifact, Pack } from '../../types';
import { renderArtifact } from '../emit';
import { CLAUDE_PLUGIN_SKILL_SPEC, CLAUDE_SCAFFOLD_SKILL_SPEC } from './spec/skill';
import { CLAUDE_AGENT_SPEC } from './spec/agent';
import { CLAUDE_WORKFLOW_SPEC } from './spec/workflow';

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
 * Build a SKILL.md.
 *
 * `inlineRules` controls whether resolved rule bodies are appended under "## Applied Rules":
 * `true` for the plugin-build path (`dist/claude/` — plugins cannot ship loose rules, so this is
 * the only way the guidance reaches the model), `false` for the CLI scaffold path
 * (`.claude/skills/` — rules are written to sibling `.claude/rules/*.md` files there and loaded
 * natively, so inlining would duplicate content already resident in context).
 *
 * Delegates to the declarative spec in `spec/skill.ts` — see spec-types.ts for why the format
 * knowledge lives there rather than here. Skills have no `paths:` equivalent — Claude Code loads
 * skills by description relevance, not file path (path-scoped loading is a `.claude/rules/*.md`-
 * only mechanism). `whenToUse` is what actually drives model-invoked dispatch: it feeds
 * `when_to_use:`, which Claude Code appends to `description` in the skill listing.
 */
export function buildPluginSkillMd(skill: ResolvedArtifact, inlineRules: boolean): string {
  const spec = inlineRules ? CLAUDE_PLUGIN_SKILL_SPEC : CLAUDE_SCAFFOLD_SKILL_SPEC;
  return renderArtifact(spec, skill, {});
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
 *
 * Delegates to the declarative spec in `spec/agent.ts` — see spec-types.ts for why the format
 * knowledge lives there rather than here.
 */
export function buildAgentMd(
  agent: ResolvedArtifact,
  catalog?: ResolvedCatalog,
  installSet?: Set<string>,
): string {
  return renderArtifact(CLAUDE_AGENT_SPEC, agent, { catalog, installSet });
}

/** Build a workflow as a user-invoked skill (SKILL.md). Delegates to `spec/workflow.ts`. */
export function buildWorkflowMd(workflow: ResolvedArtifact): string {
  return renderArtifact(CLAUDE_WORKFLOW_SPEC, workflow, {});
}
