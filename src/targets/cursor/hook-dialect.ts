/**
 * Cursor's hook contract: the neutral events and tools written into a `hooks` fragment, and the
 * stdin shape `normalizeHookInput` reads back out of a hook's input.
 *
 * Sources (checked 2026-11-02): Cursor — Hooks (https://cursor.com/docs/agent/hooks) for the
 * camelCase event names, the matcher list and the hook input fields, and Cursor — Third-party
 * hooks (https://cursor.com/docs/reference/third-party-hooks) for the Claude Code event and
 * tool-name mapping. The contract and its per-target tables are
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
 * Cursor's hook tool names per neutral tool. `todo` is `undefined`: the hooks page's matcher
 * list has no todo tool. `edit` includes `Delete`, which the `preToolUse` matcher list names and
 * which changes a file (docs/decisions/neutral-hook-contract-2026-11.md, decision 2).
 *
 * Source: https://cursor.com/docs/agent/hooks ("Available matchers by hook") and
 * https://cursor.com/docs/reference/third-party-hooks (Claude → Cursor tool mapping).
 */
const CURSOR_HOOK_TOOL_NAMES: Readonly<Record<NeutralTool, readonly string[] | undefined>> = {
  read: ['Read'],
  search: ['Grep'],
  edit: ['Write', 'Delete'],
  shell: ['Shell'],
  web: ['WebFetch', 'WebSearch'],
  agent: ['Task'],
  todo: undefined,
};

/**
 * Cursor's hook tool table: how a neutral matcher is written in a hook entry's `matcher`.
 *
 * Source: https://cursor.com/docs/agent/hooks (the matcher names) and the tool table above.
 */
export const CURSOR_HOOK_TOOL_DIALECT: ToolDialect = {
  kind: 'names',
  names: CURSOR_HOOK_TOOL_NAMES,
};

/**
 * Cursor's hook event names: every neutral event with a documented camelCase name. The
 * `notification` event is absent: the third-party mapping has no Claude Code equivalent for it.
 * Cursor's own `sessionEnd`, `preCompact` and `subagentStart` keys have no neutral event, so
 * they are not in this table (docs/decisions/neutral-hook-contract-2026-11.md, decision 1).
 *
 * Source: https://cursor.com/docs/agent/hooks (the hook event list) and
 * https://cursor.com/docs/reference/third-party-hooks (the Claude Code event mapping).
 */
export const CURSOR_HOOK_EVENTS: ReadonlyMap<HookEvent, string> = new Map<HookEvent, string>([
  ['before-tool', 'preToolUse'],
  ['after-tool', 'postToolUse'],
  ['prompt-submit', 'beforeSubmitPrompt'],
  ['session-start', 'sessionStart'],
  ['stop', 'stop'],
  ['subagent-stop', 'subagentStop'],
]);

/**
 * Where Cursor puts the pieces of a hook's stdin JSON: the Claude-compatible `tool_name` and
 * `tool_input`, `file_path` naming a file, `command` the shell command and `cwd` the working
 * directory. Cursor sends no patch text and reports no subagent type, so neither has a field.
 *
 * Source: https://cursor.com/docs/agent/hooks (the hook input fields) and
 * https://cursor.com/docs/reference/third-party-hooks.
 */
export const CURSOR_HOOK_INPUT: HookInputDialect = {
  toolField: 'tool_name',
  inputField: 'tool_input',
  pathFields: ['file_path'],
  commandField: 'command',
  cwdField: 'cwd',
  // Inverted hook tool table: the name a matcher writes is also the name stdin reports.
  toolNames: invertHookToolNames(CURSOR_HOOK_TOOL_NAMES),
};
