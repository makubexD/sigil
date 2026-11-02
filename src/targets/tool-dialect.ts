/**
 * How one target writes the provider-neutral tool vocabulary, given as data. A catalog agent or
 * skill authors neutral names (`read`, `search`, `shell`, …; src/tool-vocabulary.ts), and each
 * target supplies one `ToolDialect` value instead of copying a catalog name straight into its
 * output: either a list of the provider's own names per neutral tool (`names`), or a single
 * read-only switch (`read-only-flag`, for a provider with no tool list at all). `renderTools` is
 * the one transform; it also reports which tools the dialect cannot express, so the spec itself
 * never has to know. A `read-only-flag` rendering's `readOnly` is the nearest choice — false
 * only when an authored tool is one of the dialect's `writes` — and its `exact` says whether that
 * nearest choice lost nothing.
 *
 * A provider-specific pattern (`Bash(git log:*)`, `mcp__github__get_issue`) is not neutral
 * vocabulary: it arrives in `normalizeTools(...).unknown` and a `names` dialect passes it
 * through unchanged, while a `read-only-flag` dialect must count it as missing; a pattern only
 * narrows access, so it never clears `readOnly`.
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
 * - `read-only-flag`: the target has no tool list, only a read-only switch.
 */
export type ToolDialect =
  | {
      readonly kind: 'names';
      readonly names: Readonly<Record<NeutralTool, readonly string[] | undefined>>;
    }
  | {
      readonly kind: 'read-only-flag';
      /** The neutral tools that count as read-only. */
      readonly readOnly: readonly NeutralTool[];
      /** The tools whose presence means the nearest mapping is no flag at all. */
      readonly writes: readonly NeutralTool[];
    };

/**
 * What to write for a neutral tool list, and whether the dialect carried all of it. `missing`
 * names what it could not carry (`NeutralTool` for `names`, the unresolved entry for
 * `read-only-flag`); an empty `missing` is `exact`. `read-only-flag`'s `readOnly` is the nearest
 * mapping to the authored list (`false` when it names a `writes` tool), and `exact` says whether
 * that mapping lost nothing. Provider patterns never make a `names` rendering inexact.
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
 * pattern verbatim in authored order; `read-only-flag` output is one boolean, the nearest mapping
 * to the authored list (`false` when an authored tool is one of the dialect's `writes`).
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

/**
 * The `read-only-flag` case: the nearest boolean, `false` when an authored tool is a write.
 * Provider patterns never count as writes, so they do not clear `readOnly`.
 */
function renderReadOnlyFlag(
  dialect: Extract<ToolDialect, { kind: 'read-only-flag' }>,
  authored: readonly string[],
): RenderedTools {
  const { tools, unknown } = normalizeTools(authored);
  const readOnlySet = new Set<NeutralTool>(dialect.readOnly);
  const writesSet = new Set<NeutralTool>(dialect.writes);
  const missing: string[] = tools.filter(tool => !readOnlySet.has(tool));
  missing.push(...unknown);
  const exact = missing.length === 0;
  const readOnly = !tools.some(tool => writesSet.has(tool));
  return { kind: 'read-only-flag', readOnly, exact, missing };
}
