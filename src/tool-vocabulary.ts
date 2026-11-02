/**
 * The provider-neutral tool vocabulary. A catalog agent or skill says what capability it needs
 * (`read`, `search`, `shell`, …), and each target's emit layer maps that to what its provider
 * really reads. This module is platform-neutral: it names no target and knows no provider
 * syntax.
 *
 * The alias table is Copilot's "Tool aliases" (GitHub Copilot custom agents configuration,
 * https://docs.github.com/en/copilot/reference/custom-agents-configuration), adopted as the
 * shared legacy set in docs/decisions/neutral-agent-vocabulary-2026-11.md. Legacy matching is
 * case-sensitive here, so `READ` is unknown even though Copilot accepts its aliases in any case.
 *
 * @module
 */

/** Every capability a catalog artifact can name, in one shared vocabulary. */
export const NEUTRAL_TOOLS = ['read', 'search', 'edit', 'shell', 'web', 'agent', 'todo'] as const;

/** A tool a catalog artifact can need, in the shared vocabulary. */
export type NeutralTool = (typeof NEUTRAL_TOOLS)[number];

/** The provider tool names the catalog used before the neutral vocabulary, mapped to it. */
export const LEGACY_TOOL_ALIASES: Readonly<Record<string, NeutralTool>> = Object.freeze({
  Read: 'read',
  NotebookRead: 'read',
  Grep: 'search',
  Glob: 'search',
  Edit: 'edit',
  MultiEdit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  Bash: 'shell',
  execute: 'shell',
  powershell: 'shell',
  WebSearch: 'web',
  WebFetch: 'web',
  Task: 'agent',
  Agent: 'agent',
  'custom-agent': 'agent',
  TodoWrite: 'todo',
});

/** Whether `name` is a neutral tool name (exact match only). */
export function isNeutralTool(name: string): name is NeutralTool {
  return (NEUTRAL_TOOLS as readonly string[]).includes(name);
}

/** The neutral tool a legacy name stands for, or `undefined` for anything else. */
function legacyAliasOf(name: string): NeutralTool | undefined {
  // Own keys only: `constructor`, `toString` and friends are unknown names, not aliases.
  return Object.hasOwn(LEGACY_TOOL_ALIASES, name) ? LEGACY_TOOL_ALIASES[name] : undefined;
}

/** One name resolved: its neutral tool, and whether the input was a legacy alias. */
function classify(name: string): { neutral: NeutralTool; legacy: boolean } | undefined {
  if (isNeutralTool(name)) return { neutral: name, legacy: false };
  const neutral = legacyAliasOf(name);
  return neutral === undefined ? undefined : { neutral, legacy: true };
}

/** The three buckets `normalizeTools` returns, each deduped in first-seen order. */
export interface NormalizedTools {
  tools: NeutralTool[];
  legacy: string[];
  unknown: string[];
}

/**
 * Split `list` into neutral tools, legacy aliases and unknown names, each deduped in first-seen
 * order. `tools` is what a target's dialect renders; `legacy` and `unknown` are what a
 * conformance rule reports.
 */
export function normalizeTools(list: readonly string[]): NormalizedTools {
  const tools: NeutralTool[] = [];
  const legacy: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const name of list) {
    if (seen.has(name)) continue;
    seen.add(name);
    const found = classify(name);
    if (found === undefined) {
      unknown.push(name);
      continue;
    }
    if (!tools.includes(found.neutral)) tools.push(found.neutral);
    if (found.legacy) legacy.push(name);
  }
  return { tools, legacy, unknown };
}
