/**
 * Codex's hook contract: the neutral events and tools written into a `hooks` fragment, and the
 * stdin shape `normalizeHookInput` reads back out of a hook's input.
 *
 * Sources (checked 2026-11-02): the Codex hooks reference
 * (https://learn.chatgpt.com/docs/hooks) for the event names, the matcher rules, the tool
 * coverage table and the stdin fields; probe A4 in docs/decisions/codex-target-2026-10.md for
 * `apply_patch`'s `tool_input.command` patch text. The contract and its per-target tables are
 * docs/decisions/neutral-hook-contract-2026-11.md, decisions 1-2 and 4.
 *
 * @module
 */
import type { HookEvent } from '../../hook-vocabulary';
import type { NeutralTool } from '../../tool-vocabulary';
import { invertHookToolNames } from '../hook-input';
import type { HookInputDialect } from '../hook-input';
import type { ToolDialect } from '../tool-dialect';

/**
 * Codex's hook tool names per neutral tool. `read`, `search` and `web` are `undefined`: the hook
 * tool coverage table has no read or search tool, and `WebSearch` is hosted so it never reaches a
 * hook. `todo` is `update_plan`, a matchable local function tool; `agent` is `Agent`, which
 * `spawn_agent` also matches.
 *
 * Source: https://learn.chatgpt.com/docs/hooks (the tool coverage table).
 */
const CODEX_HOOK_TOOL_NAMES: Readonly<Record<NeutralTool, readonly string[] | undefined>> = {
  read: undefined,
  search: undefined,
  edit: ['Edit', 'Write'],
  shell: ['Bash'],
  web: undefined,
  agent: ['Agent'],
  todo: ['update_plan'],
};

/**
 * Codex's hook tool table: how a neutral matcher is written in a hook group's `matcher`.
 *
 * Source: https://learn.chatgpt.com/docs/hooks (matcher rules) and the tool coverage table
 * above.
 */
export const CODEX_HOOK_TOOL_DIALECT: ToolDialect = {
  kind: 'names',
  names: CODEX_HOOK_TOOL_NAMES,
};

/**
 * Codex's hook event names: every neutral event with a documented Codex name. The `notification`
 * event is absent: Codex has no documented counterpart.
 *
 * Source: https://learn.chatgpt.com/docs/hooks ("Hook events").
 */
export const CODEX_HOOK_EVENTS: ReadonlyMap<HookEvent, string> = new Map<HookEvent, string>([
  ['before-tool', 'PreToolUse'],
  ['after-tool', 'PostToolUse'],
  ['prompt-submit', 'UserPromptSubmit'],
  ['session-start', 'SessionStart'],
  ['stop', 'Stop'],
  ['subagent-stop', 'SubagentStop'],
]);

/**
 * Where Codex puts the pieces of a hook's stdin JSON: the tool name in `tool_name`, the arguments
 * in `tool_input`, the shell command under `command`, the subagent type as `agent_type` and the
 * working directory as `cwd`. Codex sends no path field on stdin; `apply_patch` carries its patch
 * text in `tool_input.command` (A4), so that is the one `patch` entry. `spawn_agent` is a runtime
 * name no matcher writes.
 *
 * Source: https://learn.chatgpt.com/docs/hooks (hook input) and probe A4 in
 * docs/decisions/codex-target-2026-10.md.
 */
export const CODEX_HOOK_INPUT: HookInputDialect = {
  toolField: 'tool_name',
  inputField: 'tool_input',
  pathFields: [],
  commandField: 'command',
  patch: { tools: ['apply_patch'], field: 'command' },
  agentField: 'agent_type',
  cwdField: 'cwd',
  // Inverted hook tool table, plus the runtime names no matcher writes.
  toolNames: {
    ...invertHookToolNames(CODEX_HOOK_TOOL_NAMES),
    apply_patch: 'edit',
    spawn_agent: 'agent',
  },
};
