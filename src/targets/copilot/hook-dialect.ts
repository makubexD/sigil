/**
 * Copilot's hook contract: the neutral events and tools written into a `hooks` fragment, and
 * the stdin shape `normalizeHookInput` reads back out of a hook's input.
 *
 * Sources (checked 2026-11-02): the Copilot hooks reference
 * (https://docs.github.com/en/copilot/reference/hooks-configuration) for the PascalCase event
 * aliases, the "Claude-format matchers" and the runtime → Claude tool name table, plus the VS
 * Code compatible inputs per event; VS Code's agent hooks page
 * (https://code.visualstudio.com/docs/copilot/customization/hooks) reads the same files. The
 * contract and its per-target tables are docs/decisions/neutral-hook-contract-2026-11.md,
 * decisions 1-2 and 4.
 *
 * @module
 */
import type { HookEvent } from '../../hook-vocabulary';
import type { NeutralTool } from '../../tool-vocabulary';
import { invertHookToolNames } from '../hook-input';
import type { HookInputDialect } from '../hook-input';
import type { ToolDialect } from '../tool-dialect';

/**
 * Copilot's hook tool names per neutral tool. Kept separate from `COPILOT_AGENT_TOOL_DIALECT`
 * because a hook matcher names the tools the session really calls, in the hooks reference's
 * Claude tool names. `shell` stays `Bash`: Copilot's own `PowerShell` maps to it too.
 *
 * Source: https://docs.github.com/en/copilot/reference/hooks-configuration ("Claude-format
 * matchers" and the runtime → Claude tool name table).
 */
const COPILOT_HOOK_TOOL_NAMES: Readonly<Record<NeutralTool, readonly string[]>> = {
  read: ['Read'],
  search: ['Grep', 'Glob'],
  edit: ['Edit', 'Write'],
  shell: ['Bash'],
  web: ['WebFetch', 'WebSearch'],
  agent: ['Agent'],
  todo: ['TodoWrite'],
};

/**
 * Copilot's hook tool table: how a neutral matcher is written in a hook entry's `matcher`.
 *
 * Source: https://docs.github.com/en/copilot/reference/hooks-configuration ("Claude-format
 * matchers") and the tool name table above.
 */
export const COPILOT_HOOK_TOOL_DIALECT: ToolDialect = {
  kind: 'names',
  names: COPILOT_HOOK_TOOL_NAMES,
};

/**
 * Copilot's hook event names: every neutral event with a documented PascalCase alias. The
 * `notification` event is absent: its input has only a mixed-case payload and is refused.
 *
 * Source: https://docs.github.com/en/copilot/reference/hooks-configuration ("VS Code compatible
 * inputs" per event, including `agentStop / Stop` and `subagentStop / SubagentStop`).
 */
export const COPILOT_HOOK_EVENTS: ReadonlyMap<HookEvent, string> = new Map<HookEvent, string>([
  ['before-tool', 'PreToolUse'],
  ['after-tool', 'PostToolUse'],
  ['prompt-submit', 'UserPromptSubmit'],
  ['session-start', 'SessionStart'],
  ['stop', 'Stop'],
  ['subagent-stop', 'SubagentStop'],
]);

/**
 * Where Copilot puts the pieces of a hook's stdin JSON: the Claude-compatible input, with the
 * tool arguments under `tool_input`, `file_path` / `path` naming a file and `command` the shell
 * command. Copilot sends the patch tools' arguments as one raw patch string rather than a field,
 * so `patch` has no `field`; `Task` is a runtime name no matcher writes. Copilot reports no
 * subagent type.
 *
 * Source: https://docs.github.com/en/copilot/reference/hooks-configuration (the hook input
 * tables) and https://code.visualstudio.com/docs/copilot/customization/hooks.
 */
export const COPILOT_HOOK_INPUT: HookInputDialect = {
  toolField: 'tool_name',
  inputField: 'tool_input',
  pathFields: ['file_path', 'path'],
  commandField: 'command',
  patch: { tools: ['Edit', 'Write', 'apply_patch'] },
  cwdField: 'cwd',
  // Inverted hook tool table, plus the runtime `Task` name, which no matcher writes.
  toolNames: { ...invertHookToolNames(COPILOT_HOOK_TOOL_NAMES), Task: 'agent' },
};
