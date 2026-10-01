/**
 * `pickArtifacts` — replacement for `@clack/prompts`' `groupMultiselect`/`multiselect` in the
 * `add` wizard. Built directly on `@clack/core`'s `GroupMultiSelectPrompt` (already a transitive
 * dependency via `@clack/prompts`, so this adds nothing to package.json) with a custom `render()`
 * — the same extension point `@clack/prompts` itself uses internally, not a hack.
 *
 * Why: `groupMultiselect`'s stock renderer has no viewport — it draws every option, every frame.
 * At catalog scale (~95 artifacts) that overflows the terminal, and `@clack/core`'s cursor-relative
 * repaint desyncs once the frame has scrolled, producing the "phantom pre-selected item" /
 * duplicated-block bug. `render.ts` (backed by the pure `layout.ts`) always emits the same number
 * of rows regardless of cursor position or description length, which removes the precondition for
 * that bug entirely. See `layout.ts`'s header comment for the full explanation.
 *
 * A flat (ungrouped) picker is just a `pickArtifacts` call with a single group — pass one
 * descriptive key (e.g. the kind label) instead of splitting into per-language groups, so grouped
 * and flat pickers share this one implementation with no special-casing.
 *
 * @module
 */
import { GroupMultiSelectPrompt, isCancel } from '@clack/core';
import { renderFrame } from './render';
import type { FlatRow } from './layout';
import type { PickerGroups, PickerRow } from './types';

export { isCancel };
export type { PickerGroups, PickerRow, BackRow, ItemRow } from './types';

const DEFAULT_FOOTER =
  'space  tick   ·   enter  confirm   ·   ← Back row  go back   ·   ctrl+c  quit';
const FALLBACK_TERMINAL_ROWS = 24;
const FALLBACK_TERMINAL_COLUMNS = 80;

export interface PickArtifactsOptions {
  readonly message: string;
  readonly options: PickerGroups;
  readonly initialValues?: readonly string[];
  readonly cursorAt?: string;
  readonly required?: boolean;
  readonly footerHint?: string;
}

/**
 * `this.options` on `GroupMultiSelectPrompt` is declared `(T & {group: string|boolean})[]`, but
 * the header rows it synthesizes internally (`{value, group: true, label}`) don't actually carry
 * T's other fields — the class's own generic typing is imprecise about that, not our code. `FlatRow`
 * in layout.ts models the real runtime shape (header rows XOR item rows); this cast bridges the two
 * at the one call site that needs it, same escape-hatch pattern already used in schema/emit.ts for
 * zod's recursive generics.
 */
function toFlatRows(options: unknown): readonly FlatRow[] {
  return options as readonly FlatRow[];
}

/**
 * `this` here is `Omit<GroupMultiSelectPrompt<PickerRow>, 'prompt'>` per @clack/core's own
 * `PromptOptions.render` contract — matches how @clack/prompts' own built-ins are written.
 */
function renderPrompt(
  this: { options: unknown; cursor: number; value: unknown },
  message: string,
  footerHint: string,
): string {
  return renderFrame({
    message,
    options: toFlatRows(this.options),
    cursor: this.cursor,
    selected: new Set(this.value as string[]),
    terminalRows: process.stdout.rows || FALLBACK_TERMINAL_ROWS,
    terminalColumns: process.stdout.columns || FALLBACK_TERMINAL_COLUMNS,
    footerHint,
  });
}

/**
 * Prompts with a grouped, fixed-height, column-aligned multiselect. Returns the picked `value`s,
 * or the clack cancel symbol (`isCancel(result)`) on Ctrl+C — callers use the exact same
 * `resolveOutcome` pattern as every other wizard step (see `../steps/add/prompt-helpers.ts`).
 */
export async function pickArtifacts(opts: PickArtifactsOptions): Promise<string[] | symbol> {
  const footerHint = opts.footerHint ?? DEFAULT_FOOTER;
  const prompt = new GroupMultiSelectPrompt<PickerRow>({
    options: opts.options,
    initialValues: [...(opts.initialValues ?? [])],
    required: opts.required ?? false,
    ...(opts.cursorAt !== undefined ? { cursorAt: opts.cursorAt } : {}),
    render() {
      return renderPrompt.call(this, opts.message, footerHint);
    },
  });
  return prompt.prompt() as Promise<string[] | symbol>;
}
