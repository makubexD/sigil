/**
 * Copilot's `ToolDialect`s: how the provider-neutral tool vocabulary is written in Copilot
 * frontmatter. Copilot's "Tool aliases" table documents a primary alias per neutral tool, so every
 * name here is one Copilot reads directly (all aliases are case-insensitive).
 *
 * Two dialects, because the two fields are documented with different name sets:
 *   - Agent `tools` uses the primary aliases (`shell` → `execute`).
 *   - Skill `allowed-tools` uses the skills doc's own `shell` example, and has no `agent` or `todo`
 *     entry: a skill cannot pre-approve either, so a list that only carries those renders empty.
 *
 * The per-target table and Decision 2 are in
 * docs/decisions/neutral-agent-vocabulary-2026-11.md.
 *
 * @module
 */
import { renderTools } from '../tool-dialect';
import type { ToolDialect } from '../tool-dialect';

/** Agent `tools`: Copilot's primary alias for every neutral tool. */
export const COPILOT_AGENT_TOOL_DIALECT: ToolDialect = {
  kind: 'names',
  names: {
    read: ['read'],
    search: ['search'],
    edit: ['edit'],
    shell: ['execute'],
    web: ['web'],
    agent: ['agent'],
    todo: ['todo'],
  },
};

/** Skill `allowed-tools`: the skills doc's names, with no `agent` / `todo` pre-approval. */
export const COPILOT_SKILL_TOOL_DIALECT: ToolDialect = {
  kind: 'names',
  names: {
    read: ['read'],
    search: ['search'],
    edit: ['edit'],
    shell: ['shell'],
    web: ['web'],
    agent: undefined,
    todo: undefined,
  },
};

/** The Copilot agent names for an authored tool list (always a `names` dialect). */
export function copilotAgentToolNames(authored: readonly string[]): string[] {
  const rendered = renderTools(COPILOT_AGENT_TOOL_DIALECT, authored);
  // An empty list would mean "all tools", so fail closed rather than return [].
  if (rendered.kind !== 'names')
    throw new Error('COPILOT_AGENT_TOOL_DIALECT must be a names dialect');
  return rendered.names;
}

/** The Copilot skill names for an authored tool list (always a `names` dialect). */
export function copilotSkillToolNames(authored: readonly string[]): string[] {
  const rendered = renderTools(COPILOT_SKILL_TOOL_DIALECT, authored);
  if (rendered.kind !== 'names')
    throw new Error('COPILOT_SKILL_TOOL_DIALECT must be a names dialect');
  return rendered.names;
}
