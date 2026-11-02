/**
 * The provider-neutral hook input contract (docs/decisions/neutral-hook-contract-2026-11.md,
 * decisions 3-5). A catalog hook that reads its input is a `script:` holding the body of a Node
 * function sigil calls with one `HookInput`. Each target supplies a `HookInputDialect` saying
 * where its provider puts the tool name, the tool arguments, the paths, the shell command and
 * the patch text; `normalizeHookInput` turns that provider JSON into the neutral shape, and
 * `composeHookScript` embeds the dialect, the event and the normalizer into the installed
 * `node -e` source.
 *
 * `normalizeHookInput` is embedded with `Function.prototype.toString`, so its body must stay
 * self-contained: no imports, no closure, no module-level helper or constant. The
 * composed-script test is the guard; a reference outside the body breaks the installed hook
 * while this unit test would still pass.
 *
 * The composed source re-checks the matcher itself because the VS Code "Local" hook parser
 * ignores `matcher` values (VS Code hooks page, "Existing Local hooks"), so a script hook means
 * the same thing on a host that drops the matcher.
 *
 * @module
 */
import { TOOL_HOOK_EVENTS } from '../hook-vocabulary';
import type { HookEvent } from '../hook-vocabulary';
import { NEUTRAL_TOOLS } from '../tool-vocabulary';
import type { NeutralTool } from '../tool-vocabulary';

/**
 * What a `script:` hook receives as `input`. `files` holds every path the call names — path
 * fields first, then patch headers — deduped in first-seen order and exactly as sent. `input`
 * itself is `undefined` when stdin is not JSON or not an object; the script decides whether
 * that fails open.
 */
export interface HookInput {
  /** The neutral event that fired. */
  event: HookEvent;
  /** Tool events only; undefined when the provider's tool has no neutral name. */
  tool?: NeutralTool;
  /** Every path the call names: path fields, then patch headers; deduped, as sent. */
  files: string[];
  /** The shell command, only when `tool` is `'shell'`. */
  command?: string;
  /** The subagent type, when the provider reports one. */
  agent?: string;
  /** The provider's working directory, when it reports one. */
  cwd?: string;
}

/**
 * The data one target's hook input needs (the `McpDialect` pattern: a new target supplies one
 * value, never its own builder). Dotted paths walk `a.b.c` through the parsed stdin; the
 * `pathFields` and `commandField` are direct keys inside the tool arguments.
 */
export interface HookInputDialect {
  /** Dotted path to the provider tool name: `tool_name` | `toolCall.name`. */
  readonly toolField: string;
  /** Dotted path to the tool arguments: `tool_input` | `toolCall.args`. */
  readonly inputField: string;
  /** Keys inside the arguments holding one path. */
  readonly pathFields: readonly string[];
  /** Key inside the arguments holding the shell command. */
  readonly commandField?: string;
  /**
   * Provider tools whose arguments carry patch text: in `field`, or the arguments
   * themselves when a string.
   */
  readonly patch?: { readonly tools: readonly string[]; readonly field?: string };
  /** Dotted path to the subagent type. */
  readonly agentField?: string;
  /** Dotted path to the working directory. */
  readonly cwdField?: string;
  /** Provider tool name → neutral tool. */
  readonly toolNames: Readonly<Record<string, NeutralTool>>;
}

/**
 * Invert a target's hook tool table (neutral tool → provider names, `undefined` for a tool it
 * cannot name) into the provider-name → neutral-tool map a dialect's `toolNames` holds.
 */
export function invertHookToolNames(
  names: Readonly<Record<NeutralTool, readonly string[] | undefined>>,
): Record<string, NeutralTool> {
  const inverted: Record<string, NeutralTool> = {};
  for (const tool of NEUTRAL_TOOLS) {
    for (const name of names[tool] ?? []) inverted[name] = tool;
  }
  return inverted;
}

// eslint-disable-next-line max-lines-per-function -- self-contained for toString embedding
export function normalizeHookInput(
  raw: string,
  dialect: HookInputDialect,
  event: HookEvent,
): HookInput | undefined {
  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
  function readPath(value: unknown, path: string | undefined): unknown {
    if (path === undefined) return undefined;
    let current: unknown = value;
    for (const key of path.split('.')) {
      if (!isRecord(current)) return undefined;
      current = current[key];
    }
    return current;
  }
  function stringAt(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }
  function patchFiles(text: string): string[] {
    const header = /^\s*\*\*\*\s*(?:add file|update file|delete file|move to):[ \t]*(.+)$/gim;
    return [...text.matchAll(header)].map(match => (match[1] ?? '').trim());
  }
  function addPath(value: unknown, files: Set<string>): void {
    if (typeof value !== 'string' || value === '' || files.has(value)) return;
    files.add(value);
  }
  function addPaths(args: unknown, fields: readonly string[], files: Set<string>): void {
    if (!isRecord(args)) return;
    for (const field of fields) addPath(args[field], files);
  }
  function patchText(args: unknown, patch: { readonly field?: string }): unknown {
    if (typeof args === 'string') return args;
    if (patch.field === undefined || !isRecord(args)) return undefined;
    return args[patch.field];
  }
  function addPatch(
    name: unknown,
    args: unknown,
    patch: HookInputDialect['patch'],
    files: Set<string>,
  ): void {
    if (typeof name !== 'string' || patch === undefined || !patch.tools.includes(name)) return;
    const text = patchText(args, patch);
    if (typeof text !== 'string') return;
    for (const path of patchFiles(text)) addPath(path, files);
  }
  function commandOf(tool: unknown, args: unknown, field: string | undefined): string | undefined {
    if (tool !== 'shell' || field === undefined || !isRecord(args)) return undefined;
    return stringAt(args[field]);
  }
  function toolOf(name: unknown, names: HookInputDialect['toolNames']): NeutralTool | undefined {
    return typeof name === 'string' && Object.hasOwn(names, name) ? names[name] : undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const name = readPath(parsed, dialect.toolField);
  const tool = toolOf(name, dialect.toolNames);
  const args = readPath(parsed, dialect.inputField);
  const files = new Set<string>();
  addPaths(args, dialect.pathFields, files);
  addPatch(name, args, dialect.patch, files);
  const input: HookInput = { event, files: [...files] };
  if (tool !== undefined) input.tool = tool;
  const command = commandOf(tool, args, dialect.commandField);
  if (command !== undefined) input.command = command;
  const agent = stringAt(readPath(parsed, dialect.agentField));
  if (agent !== undefined) input.agent = agent;
  const cwd = stringAt(readPath(parsed, dialect.cwdField));
  if (cwd !== undefined) input.cwd = cwd;
  return input;
}

/**
 * The matcher lines spliced into a composed script: the neutral tool list as a JSON literal and
 * the guard that skips the script for a named tool outside it. Empty when `tools` is undefined
 * or the event does not fire around a tool call.
 */
function matcherLines(event: HookEvent, tools?: readonly NeutralTool[]): string[] {
  if (tools === undefined || !TOOL_HOOK_EVENTS.includes(event)) return [];
  return [
    `  const tools = ${JSON.stringify(tools)};`,
    '  if (normalized !== undefined && normalized.tool !== undefined && !tools.includes(normalized.tool)) return;',
  ];
}

/**
 * The `node -e` source for a `script:` hook (decision 5): the normalizer's own source, the
 * dialect and the event as JSON literals, a stdin reader on `process.stdin` and the authored
 * script as a function of `input`. When `tools` is given and `event` fires around a tool call,
 * the source skips the script for a named tool outside that set; an undefined `input` or
 * `input.tool` still runs it, since the provider may have matched a tool sigil cannot name.
 */
export function composeHookScript(
  script: string,
  dialect: HookInputDialect,
  event: HookEvent,
  tools?: readonly NeutralTool[],
): string {
  return [
    `const dialect = ${JSON.stringify(dialect)};`,
    `const event = ${JSON.stringify(event)};`,
    `const normalizeHookInput = ${normalizeHookInput.toString()};`,
    `let raw = '';`,
    `process.stdin.setEncoding('utf8');`,
    `process.stdin.on('data', chunk => (raw += chunk)).on('end', () => {`,
    `  const normalized = normalizeHookInput(raw, dialect, event);`,
    ...matcherLines(event, tools),
    // The script sits on its own lines, so a trailing `//` comment cannot swallow the close.
    `  (function (input) {\n${script}\n  })(normalized);`,
    `});`,
  ].join('\n');
}
