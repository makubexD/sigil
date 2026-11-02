/**
 * Antigravity's hook contract: the neutral events and tools written into a `hooks.json`
 * fragment, and the stdin shape `normalizeHookInput` reads back out of a hook's input.
 *
 * Sources (checked 2026-11-02): Antigravity — Hooks (https://antigravity.google/docs/hooks) for
 * the event names, the documented tool names and the hook input fields, and the project's own
 * probes P4 and E1 (`agy 1.4.12`) for the observed tool names and argument keys
 * (docs/decisions/antigravity-target-2026-11.md). The contract and its per-target tables are
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
 * Antigravity's hook tool names per neutral tool. `todo` is `undefined`: no task-list tool is
 * documented or observed. `edit` names both the documented tools (`write_to_file`,
 * `replace_file_content`, `multi_replace_file_content`) and the observed ones (`write_file`,
 * `edit_file`), because the docs and the binary disagree on the names and a matcher naming only
 * one set lets the other through (P4, E1 and D1 in docs/decisions/antigravity-target-2026-11.md).
 *
 * Source: https://antigravity.google/docs/hooks ("Supported tools") for the documented names;
 * P4, D1 and E1 for `write_file`, `edit_file` and `read_file`.
 */
const ANTIGRAVITY_HOOK_TOOL_NAMES: Readonly<Record<NeutralTool, readonly string[] | undefined>> = {
  read: ['view_file', 'read_file'],
  search: ['grep_search', 'find_by_name', 'list_dir'],
  edit: [
    'write_to_file',
    'replace_file_content',
    'multi_replace_file_content',
    'write_file',
    'edit_file',
  ],
  shell: ['run_command'],
  web: ['search_web', 'read_url_content'],
  agent: ['invoke_subagent'],
  todo: undefined,
};

/**
 * Antigravity's hook tool table: how a neutral matcher is written in a hook entry's `matcher`.
 * E1 run 3 confirmed the `|` alternation matches whole names, so the edit set above is safe
 * (probe E1 in docs/decisions/antigravity-target-2026-11.md).
 *
 * Source: https://antigravity.google/docs/hooks (the documented tool names) and the tool table
 * above.
 */
export const ANTIGRAVITY_HOOK_TOOL_DIALECT: ToolDialect = {
  kind: 'names',
  names: ANTIGRAVITY_HOOK_TOOL_NAMES,
};

/**
 * Antigravity's hook event names: the four neutral events with a documented name. `PreInvocation`
 * is not `prompt-submit` (it fires before every model invocation, not once per prompt), and
 * there is no event for `subagent-stop` or `notification`
 * (probe E1 in docs/decisions/antigravity-target-2026-11.md).
 *
 * Source: https://antigravity.google/docs/hooks (the hook event list).
 */
export const ANTIGRAVITY_HOOK_EVENTS: ReadonlyMap<HookEvent, string> = new Map<HookEvent, string>([
  ['before-tool', 'PreToolUse'],
  ['after-tool', 'PostToolUse'],
  ['session-start', 'SessionStart'],
  ['stop', 'Stop'],
]);

/**
 * Where Antigravity puts the pieces of a hook's stdin JSON: the tool name and arguments under
 * `toolCall`, the path in `TargetFile` (documented), `Path` (P4) or `AbsolutePath`, and the
 * shell command in `CommandLine`. No Antigravity tool carries patch text, and stdin reports
 * neither a subagent type nor a working directory (`workspacePaths` is an array and `Cwd` is a
 * `run_command` argument only), so neither has a field (probe E1 in
 * docs/decisions/antigravity-target-2026-11.md).
 *
 * Source: https://antigravity.google/docs/hooks (the hook input fields) and the P4 / E1 probe
 * log.
 */
export const ANTIGRAVITY_HOOK_INPUT: HookInputDialect = {
  toolField: 'toolCall.name',
  inputField: 'toolCall.args',
  pathFields: ['TargetFile', 'Path', 'AbsolutePath'],
  commandField: 'CommandLine',
  // Inverted hook tool table: the name a matcher writes is also the name stdin reports.
  toolNames: invertHookToolNames(ANTIGRAVITY_HOOK_TOOL_NAMES),
};
