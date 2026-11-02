/**
 * agents-standard's `ToolDialect`: how the provider-neutral tool vocabulary is written in the
 * open-standard target's skill frontmatter. The Agent Skills spec's own example uses Claude-style
 * names (`allowed-tools: Read, Grep`), so every neutral tool has a name here and a skill's
 * `allowed-tools` is carried exactly.
 *
 * The names are defined here rather than imported from `targets/claude-code/` — targets stay
 * independent of each other; the values are identical only because Decision 6 chose the spec's
 * convention. `search` is Grep and Glob, and `edit` is Edit and Write, for the same reason Claude
 * widens them (an `allowed-tools` entry pre-approves, it restricts nothing).
 * The per-target table and Decision 6 are in
 * docs/decisions/neutral-agent-vocabulary-2026-11.md.
 *
 * @module
 */
import { renderTools } from '../tool-dialect';
import type { ToolDialect } from '../tool-dialect';

export const AGENTS_STANDARD_TOOL_DIALECT: ToolDialect = {
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
 * The open-standard names for an authored tool list (`AGENTS_STANDARD_TOOL_DIALECT` is always a
 * `names` dialect). A spec's `serialize` narrows `renderTools`' union through this before writing
 * the YAML line.
 */
export function agentsStandardToolNames(authored: readonly string[]): string[] {
  const rendered = renderTools(AGENTS_STANDARD_TOOL_DIALECT, authored);
  // An empty list would mean "all tools", so fail closed rather than return [].
  if (rendered.kind !== 'names')
    throw new Error('AGENTS_STANDARD_TOOL_DIALECT must be a names dialect');
  return rendered.names;
}
