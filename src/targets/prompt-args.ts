/**
 * Argument and placeholder utilities for prompt artifacts.
 *
 * Catalog source authors write `{{name}}` template placeholders and declare
 * named arguments in the `args:` frontmatter list. Each platform has its own
 * substitution syntax, so adapters call the right helper before emitting.
 *
 * - Claude Code custom commands: `$name` (resolved via `arguments:` frontmatter)
 * - GitHub Copilot prompt files: `${input:name}` (VS Code input variable syntax)
 *
 * `buildArgumentHint` formats the `argument-hint:` frontmatter value shown
 * in the Claude Code `/` menu autocomplete: e.g. "[diff] [audience]".
 *
 * NOTE on Copilot `${input:name:placeholder}` — not used intentionally.
 * The three-part form embeds a description after the second colon, but arg
 * descriptions can themselves contain colons (e.g. "Options: reviewer, junior,
 * manager"), which would break YAML / VS Code's input variable parser. The
 * two-part `${input:name}` is always safe.
 */

export interface PromptArg {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * Core substitution engine. Replaces every `{{name}}` token (tolerant of inner
 * whitespace, e.g. `{{ name }}`) using the provided `render` callback.
 */
export function substitutePlaceholders(body: string, render: (name: string) => string): string {
  return body.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_match, name: string) => render(name));
}

/**
 * Translates `{{name}}` → `$name` for Claude Code custom commands.
 * Claude resolves `$name` via the `arguments:` frontmatter list (names → positions).
 */
export function toClaudePlaceholders(body: string): string {
  return substitutePlaceholders(body, name => `$${name}`);
}

/**
 * Translates `{{name}}` → `${input:name}` for GitHub Copilot prompt files.
 * VS Code resolves `${input:name}` via user input at invocation time.
 */
export function toCopilotPlaceholders(body: string): string {
  return substitutePlaceholders(body, name => `\${input:${name}}`);
}

/** `${input:name}` or `${input:name:hint}` — other VS Code variables (`${file}`, …) are left alone. */
const COPILOT_INPUT_RE = /\$\{input:([\w-]+)(?::([^}]*))?\}/g;

export interface CopilotPlaceholderResult {
  body: string;
  args: PromptArg[];
}

function recordArg(args: Map<string, PromptArg>, name: string, hint?: string): void {
  const existing = args.get(name);
  if (!existing) {
    args.set(name, hint === undefined ? { name } : { name, description: hint });
  } else if (existing.description === undefined && hint !== undefined) {
    existing.description = hint;
  }
}

/**
 * Inverse of `toCopilotPlaceholders`: turns `${input:name}` / `${input:name:hint}` into
 * `{{name}}` and collects each distinct name once, in first-seen order, as a `PromptArg`
 * (`description: hint` when a hint exists).
 */
export function fromCopilotPlaceholders(body: string): CopilotPlaceholderResult {
  const args = new Map<string, PromptArg>();
  const result = body.replace(COPILOT_INPUT_RE, (_match, name: string, hint?: string) => {
    recordArg(args, name, hint);
    return `{{${name}}}`;
  });
  return { body: result, args: [...args.values()] };
}

/**
 * Builds the Claude Code `argument-hint:` frontmatter value.
 * Each arg is shown as `[name]`; required args appear without distinction
 * (hint is purely for display, not validation).
 *
 * @example
 * buildArgumentHint([{name:'diff'},{name:'audience'}])
 * // → "[diff] [audience]"
 */
export function buildArgumentHint(args: PromptArg[]): string {
  return args.map(a => `[${a.name}]`).join(' ');
}
