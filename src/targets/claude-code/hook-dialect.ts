/**
 * Claude Code's hook contract: the neutral events and tools written into a `hooks` fragment,
 * and the stdin shape `normalizeHookInput` reads back out of a hook's input.
 *
 * Sources (checked 2026-11-02): the Hooks reference
 * (https://code.claude.com/docs/en/hooks) for the event names, the matcher syntax and the tool
 * event stdin fields, and the tools reference
 * (https://code.claude.com/docs/en/tools-reference) for the tool names. The contract and its
 * per-target tables are docs/decisions/neutral-hook-contract-2026-11.md, decisions 1-2 and 4.
 *
 * @module
 */
import type { HookEvent } from '../../hook-vocabulary';
import type { NeutralTool } from '../../tool-vocabulary';
import { NEUTRAL_TOOLS } from '../../tool-vocabulary';
import type { HookInputDialect } from '../hook-input';
import type { ToolDialect } from '../tool-dialect';

/**
 * Claude Code's hook tool names per neutral tool. Kept separate from `CLAUDE_TOOL_DIALECT`
 * because a hook matcher names the tools the session really calls (an agent's `tools` list is a
 * capability grant, not a matcher). `edit` includes `NotebookEdit`, so a guard on `Edit|Write`
 * also matches notebook writes; `shell` includes `PowerShell`, the tools reference's own shell
 * tool.
 *
 * Source: https://code.claude.com/docs/en/hooks (matchers) and
 * https://code.claude.com/docs/en/tools-reference (tool names).
 */
const CLAUDE_HOOK_TOOL_NAMES: Readonly<Record<NeutralTool, readonly string[]>> = {
  read: ['Read'],
  search: ['Grep', 'Glob'],
  edit: ['Edit', 'Write', 'NotebookEdit'],
  shell: ['Bash', 'PowerShell'],
  web: ['WebFetch', 'WebSearch'],
  agent: ['Agent'],
  todo: ['TodoWrite'],
};

/**
 * Claude Code's hook tool table: how a neutral matcher is written in `hooks[].matcher`.
 *
 * Source: https://code.claude.com/docs/en/hooks (matcher rules) and
 * https://code.claude.com/docs/en/tools-reference (the names above).
 */
export const CLAUDE_HOOK_TOOL_DIALECT: ToolDialect = {
  kind: 'names',
  names: CLAUDE_HOOK_TOOL_NAMES,
};

/** Invert the hook tool table into the provider-name → neutral-tool map the normalizer reads. */
function invertHookToolNames(
  names: Readonly<Record<NeutralTool, readonly string[]>>,
): Readonly<Record<string, NeutralTool>> {
  const inverted: Record<string, NeutralTool> = {};
  for (const tool of NEUTRAL_TOOLS) {
    for (const name of names[tool]) inverted[name] = tool;
  }
  return inverted;
}

/**
 * Claude Code's hook event names: every neutral event has a documented Claude Code name.
 *
 * Source: https://code.claude.com/docs/en/hooks ("Hook events").
 */
export const CLAUDE_HOOK_EVENTS: ReadonlyMap<HookEvent, string> = new Map<HookEvent, string>([
  ['before-tool', 'PreToolUse'],
  ['after-tool', 'PostToolUse'],
  ['prompt-submit', 'UserPromptSubmit'],
  ['session-start', 'SessionStart'],
  ['stop', 'Stop'],
  ['subagent-stop', 'SubagentStop'],
  ['notification', 'Notification'],
]);

/**
 * Where Claude Code puts the pieces of a hook's stdin JSON. The Hooks reference documents that
 * "for tool events, that field is `tool_name`", the tool arguments under `tool_input` (with
 * `file_path`, `path` and `notebook_path` naming a file and `command` the shell command), the
 * subagent type as `agent_type`, and the working directory as `cwd`. Claude Code sends no patch
 * text on stdin, so there is no `patch` entry.
 *
 * Source: https://code.claude.com/docs/en/hooks ("Common input fields", "Tool events").
 */
export const CLAUDE_HOOK_INPUT: HookInputDialect = {
  toolField: 'tool_name',
  inputField: 'tool_input',
  pathFields: ['file_path', 'path', 'notebook_path'],
  commandField: 'command',
  agentField: 'agent_type',
  cwdField: 'cwd',
  // Inverted hook tool table: the name a matcher writes is also the name stdin reports.
  toolNames: invertHookToolNames(CLAUDE_HOOK_TOOL_NAMES),
};
