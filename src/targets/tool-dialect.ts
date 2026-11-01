/**
 * How one target writes the provider-neutral tool vocabulary, given as data. A catalog agent or
 * skill authors neutral names (`read`, `search`, `shell`, …; src/tool-vocabulary.ts), and each
 * target supplies one `ToolDialect` value instead of copying a catalog name straight into its
 * output: either a list of the provider's own names per neutral tool (`names`), or a single
 * read-only switch (`read-only-flag`, for a provider with no tool list at all). `renderTools` is
 * the one transform; it also reports which tools the dialect cannot express, so the spec itself
 * never has to know.
 *
 * A provider-specific pattern (`Bash(git log:*)`, `mcp__github__get_issue`) is not neutral
 * vocabulary: it arrives in `normalizeTools(...).unknown` and a `names` dialect passes it
 * through unchanged, while a `read-only-flag` dialect must count it as missing.
 *
 * See docs/decisions/neutral-agent-vocabulary-2026-11.md for the per-target tables behind each
 * dialect constant.
 *
 * @module
 */
import { normalizeTools } from '../tool-vocabulary';
import type { NeutralTool } from '../tool-vocabulary';

/**
 * How one target writes a neutral tool list.
 *
 * - `names`: one provider name list per neutral tool, in the target's order. An `undefined`
 *   entry means the provider has no such tool.
 * - `read-only-flag`: the target has no tool list, only a read-only switch naming which neutral
 *   tools count as read-only.
 */
export type ToolDialect =
  | {
      readonly kind: 'names';
      readonly names: Readonly<Record<NeutralTool, readonly string[] | undefined>>;
    }
  | { readonly kind: 'read-only-flag'; readonly readOnly: readonly NeutralTool[] };

/**
 * What to write for a neutral tool list, and whether the dialect carried all of it. `missing`
 * names what it could not carry (`NeutralTool` for `names`, the unresolved entry for
 * `read-only-flag`); an empty `missing` is `exact`. Provider patterns never make a `names`
 * rendering inexact.
 */
export type RenderedTools =
  | {
      readonly kind: 'names';
      readonly names: string[];
      readonly exact: boolean;
      readonly missing: NeutralTool[];
    }
  | {
      readonly kind: 'read-only-flag';
      readonly readOnly: boolean;
      readonly exact: boolean;
      readonly missing: string[];
    };

/** `names` with duplicates removed, keeping the first occurrence of each. */
function dedupe(names: readonly string[]): string[] {
  return [...new Set(names)];
}

/**
 * Render an authored tool list (neutral names, legacy aliases, or provider patterns) through
 * `dialect`. Legacy names count as their neutral tool (normalizeTools). `names` output is the
 * neutral tools' first-seen order, each expanded in the dialect's order, then every provider
 * pattern verbatim in authored order; `read-only-flag` output is one boolean that is true only
 * when every authored entry is read-only.
 */
export function renderTools(dialect: ToolDialect, authored: readonly string[]): RenderedTools {
  return dialect.kind === 'names'
    ? renderNames(dialect, authored)
    : renderReadOnlyFlag(dialect, authored);
}

/** The `names` case: each neutral tool's provider names, then patterns verbatim. */
function renderNames(
  dialect: Extract<ToolDialect, { kind: 'names' }>,
  authored: readonly string[],
): RenderedTools {
  const { tools, unknown } = normalizeTools(authored);
  const names: string[] = [];
  const missing: NeutralTool[] = [];
  for (const tool of tools) {
    const providerNames = dialect.names[tool];
    if (providerNames === undefined) {
      missing.push(tool);
      continue;
    }
    names.push(...providerNames);
  }
  names.push(...unknown);
  return { kind: 'names', names: dedupe(names), exact: missing.length === 0, missing };
}

/** The `read-only-flag` case: one boolean, true only when every entry is read-only. */
function renderReadOnlyFlag(
  dialect: Extract<ToolDialect, { kind: 'read-only-flag' }>,
  authored: readonly string[],
): RenderedTools {
  const { tools, unknown } = normalizeTools(authored);
  const readOnlySet = new Set<NeutralTool>(dialect.readOnly);
  const missing: string[] = tools.filter(tool => !readOnlySet.has(tool));
  missing.push(...unknown);
  const exact = missing.length === 0;
  return { kind: 'read-only-flag', readOnly: exact, exact, missing };
}
