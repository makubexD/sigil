/**
 * Antigravity's agent `ToolDialect` (../tool-dialect.ts): a subagent's `tools` field takes
 * Antigravity's own tool names, so each neutral tool expands to the names a probe saw load and
 * work. The [Hooks, Supported tools](https://antigravity.google/docs/hooks#supported-tools) page
 * documents `view_file`, `write_to_file` and `replace_file_content`; probe D1 on `agy 1.4.12`
 * (docs/decisions/antigravity-target-2026-11.md) loaded every name below and confirmed each grants
 * its tool.
 *
 * Only probed names are written. A misspelt or unmapped `tools` name "may cause the subagent
 * process to hang" ([Custom subagents](https://antigravity.google/docs/subagents)), so
 * `multi_replace_file_content` is left out: D1 never saw it granted, alone or beside the other
 * edit names. `read_file`, `write_file` and `edit_file` load too, as a parallel set under their
 * own names, so D1 keeps the documented names and writes one name per tool, never both.
 *
 * `todo` has no Antigravity tool, documented or observed (D1), so an agent that authors it renders
 * inexact and `restrictionOutcome` fails closed: skipped, or written nearest under
 * `toolPolicy: nearest`. An absent `tools` grants no write tool (U3), so decision 2 writes the
 * full name list instead (ANTIGRAVITY_ALL_TOOL_NAMES). `ANTIGRAVITY_MODEL_TIERS` holds the closed
 * model-tier set for D3: a value outside it drops the agent silently.
 *
 * @module
 */
import { renderTools } from '../tool-dialect';
import type { ToolDialect } from '../tool-dialect';
import { NEUTRAL_TOOLS } from '../../tool-vocabulary';

/** Agent `tools`: one Antigravity name per neutral tool D1 saw load and work. */
export const ANTIGRAVITY_AGENT_TOOL_DIALECT: ToolDialect = {
  kind: 'names',
  names: {
    read: ['view_file'],
    search: ['grep_search', 'find_by_name', 'list_dir'],
    edit: ['write_to_file', 'replace_file_content'],
    shell: ['run_command'],
    web: ['search_web', 'read_url_content'],
    agent: ['invoke_subagent'],
    todo: undefined,
  },
};

/** The Antigravity agent names for an authored tool list (always a `names` dialect). */
export function antigravityAgentToolNames(authored: readonly string[]): string[] {
  const rendered = renderTools(ANTIGRAVITY_AGENT_TOOL_DIALECT, authored);
  if (rendered.kind !== 'names')
    throw new Error('ANTIGRAVITY_AGENT_TOOL_DIALECT must be a names dialect');
  return rendered.names;
}

/**
 * Every Antigravity tool name, in `NEUTRAL_TOOLS` order and deduped: what an agent with no
 * authored `tools` gets (decision 2). `todo` contributes nothing; browser, image and MCP tools
 * are outside the neutral vocabulary and are never written here.
 */
export const ANTIGRAVITY_ALL_TOOL_NAMES: readonly string[] = antigravityAgentToolNames([
  ...NEUTRAL_TOOLS,
]);

/**
 * Neutral model tier → Antigravity's model value (decision 3, kept by D1: `flash_lite` and `pro`
 * both load). A value outside the tiers drops the agent with no warning, so the table is closed:
 * never write anything but these three. An absent neutral `model` writes nothing (`inherit` is
 * Antigravity's default).
 */
export const ANTIGRAVITY_MODEL_TIERS: Readonly<Record<'fast' | 'balanced' | 'deep', string>> = {
  fast: 'flash_lite',
  balanced: 'flash',
  deep: 'pro',
};
