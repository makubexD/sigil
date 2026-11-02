/**
 * Claude Code's `ToolDialect`: how the provider-neutral tool vocabulary is written in Claude
 * frontmatter. Every neutral tool has a Claude name (none is `undefined`), so an agent's `tools`
 * or `disallowedTools` and a skill's `allowed-tools` are carried exactly.
 *
 * `search` is Grep and Glob, and `edit` is Edit and Write: the coarse neutral names widen a
 * skill's pre-approval by one tool (an `allowed-tools` entry only pre-approves, it restricts
 * nothing). On an agent, `edit` likewise grants Write alongside Edit; every catalog agent that
 * lists Edit also lists Bash, which can already write files, so no agent gains a capability.
 * The per-target table and Decision 1 are in
 * docs/decisions/neutral-agent-vocabulary-2026-11.md.
 *
 * @module
 */
import { renderTools } from '../tool-dialect';
import type { ToolDialect } from '../tool-dialect';

export const CLAUDE_TOOL_DIALECT: ToolDialect = {
  kind: 'names',
  names: {
    read: ['Read'],
    search: ['Grep', 'Glob'],
    edit: ['Edit', 'Write'],
    shell: ['Bash'],
    web: ['WebFetch', 'WebSearch'],
    agent: ['Agent'],
    todo: ['TodoWrite'],
  },
};

/**
 * The Claude names for an authored tool list (`CLAUDE_TOOL_DIALECT` is always a `names` dialect).
 * A spec's `serialize` narrows `renderTools`' union through this before writing the YAML line.
 */
export function claudeToolNames(authored: readonly string[]): string[] {
  const rendered = renderTools(CLAUDE_TOOL_DIALECT, authored);
  // An empty list would mean "all tools", so fail closed rather than return [].
  if (rendered.kind !== 'names') throw new Error('CLAUDE_TOOL_DIALECT must be a names dialect');
  return rendered.names;
}
