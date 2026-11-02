/**
 * HookSchema — split out of index.ts to keep that file under the max-lines cap. Imports
 * BaseFields from shared.ts rather than index.ts to avoid a cycle (index.ts's SCHEMAS map
 * assembles this schema).
 */
import { z } from 'zod';
import { CONFIG_SCOPES } from '../types';
import { HOOK_EVENTS, LEGACY_HOOK_EVENT_ALIASES, parseHookMatcher } from '../hook-vocabulary';
import { BaseFields } from './shared';

/** Why a matcher name is rejected; the name itself is quoted before it. */
const HINT =
  'is not a neutral tool name: a matcher is `*` or neutral tools (read, search, edit, shell, web, agent, todo) joined with |';

/** Adds one issue per matcher name that is neither a neutral tool nor a legacy alias. */
function refineMatcher(value: string, ctx: z.RefinementCtx): void {
  const parsed = parseHookMatcher(value);
  for (const name of parsed.kind === 'tools' ? parsed.unknown : [])
    ctx.addIssue({ code: 'custom', message: `${name === '' ? "''" : `\`${name}\``} ${HINT}` });
}

/**
 * Object-level hook check: exactly one of `script` and `command`, and `args` only
 * alongside `command`.
 */
function refineHookFields(
  hook: {
    script?: string | undefined;
    command?: string | undefined;
    args?: string[] | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  if ((hook.script === undefined) === (hook.command === undefined))
    ctx.addIssue({
      code: 'custom',
      message: 'a hook sets exactly one of `script` and `command`',
      path: ['script'],
    });
  if (hook.args !== undefined && hook.command === undefined)
    ctx.addIssue({ code: 'custom', message: '`args` needs `command`', path: ['args'] });
}

export const HookSchema = z
  .object({
    ...BaseFields,
    kind: z.literal('hook'),
    /** Optional: language scope for this hook. Omit for shared/all-language hooks. */
    language: z.string().optional(),
    /**
     * Default install scope recommended by the catalog author.
     * Overridable by --scope flag or wizard selection at install time.
     * 'project' (default) = the target's project config (git-committed).
     * 'local'             = the target's local, gitignored config.
     * 'user'              = the target's user-global config.
     */
    defaultScope: z.enum(CONFIG_SCOPES).optional(),
    /**
     * The neutral lifecycle event (src/hook-vocabulary.ts); each hook target maps it.
     * The PascalCase names are legacy aliases.
     */
    event: z.enum([...HOOK_EVENTS, ...Object.keys(LEGACY_HOOK_EVENT_ALIASES)]),
    /**
     * Neutral tool matcher: `*` for every tool, or neutral tool names joined with `|`
     * (`edit`, `shell|edit`). Each hook target maps the names to its provider's tool names;
     * legacy provider names are accepted and flagged. Defaults to '*' (all tools).
     */
    matcher: z.string().optional().default('*').superRefine(refineMatcher),
    /**
     * Body of a Node.js function that reads the hook's input: sigil calls it with one
     * argument, `input` (the neutral HookInput, `undefined` when the provider's stdin is not
     * a JSON object). Deny by setting `process.exitCode = 2` and writing the reason to
     * stderr — every hook target blocks on exit 2. Exactly one of `script` and `command`
     * is set.
     */
    script: z.string().min(1).optional(),
    /**
     * Shell command to run when the hook fires, or — with `args` — the executable to spawn.
     * Exactly one of `script` and `command` is set; `args` needs `command`.
     */
    command: z.string().min(1).optional(),
    /**
     * Exec form: when set, `command` is spawned directly with these arguments and no shell
     * (code.claude.com/docs/en/hooks, "Exec form and shell form"). Prefer it for any hook whose
     * exit code matters: on Windows without Git Bash, shell-form hooks run through PowerShell,
     * which reports a native command's exit code 2 as 1, so a blocking hook stops blocking.
     */
    args: z.array(z.string()).optional(),
    /** Optional timeout in seconds; each hook target writes it in its own unit. */
    timeout: z.number().int().positive().optional(),
  })
  .superRefine(refineHookFields);
