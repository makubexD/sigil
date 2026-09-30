/**
 * Kind registry — single source of truth for artifact kind metadata.
 *
 * Every place in the codebase that needs to iterate kinds, check membership,
 * or look up per-kind display data imports from here. Adding a new artifact kind
 * means adding one entry to KIND_REGISTRY; the compiler's Record<ArtifactKind, …>
 * constraint makes omission a compile error.
 *
 * Design contract:
 *   - ArtifactKind (the literal union) lives in types.ts — it is the type-level source.
 *   - KIND_REGISTRY is the runtime source for per-kind metadata.
 *   - CONFIG_KINDS and isConfigKind are derived from isConfig — there is exactly one
 *     place where the config-kind subset is declared.
 *
 * @module
 */

import type { ArtifactKind, ConfigKind } from './types';

// ─── Descriptor ───────────────────────────────────────────────────────────────

export interface KindDescriptor {
  readonly kind: ArtifactKind;
  /** True when this kind merges into a user-owned JSON file rather than writing a whole file. */
  readonly isConfig: boolean;
  /**
   * Position in the wizard/UI display list.
   * Config kinds appear first (lower values), then code kinds.
   */
  readonly displayOrder: number;
  /** Body placeholder comment emitted by `sigil new` for this kind. */
  readonly bodyComment: string;
}

// ─── Registry (one entry per ArtifactKind — compiler-enforced) ───────────────

/**
 * Per-kind descriptor table.
 *
 * The Record<ArtifactKind, …> type forces a compile error when a kind is added
 * to the ArtifactKind union but omitted here. Add new kinds by appending an entry;
 * no other file needs editing for the registry itself.
 */
export const KIND_REGISTRY: Record<ArtifactKind, KindDescriptor> = {
  // Config kinds — merge into JSON files, language-agnostic
  mcp: {
    kind: 'mcp',
    isConfig: true,
    displayOrder: 0,
    bodyComment:
      'Describe what this MCP server provides. The server: above is merged into .mcp.json.',
  },
  hook: {
    kind: 'hook',
    isConfig: true,
    displayOrder: 1,
    bodyComment:
      'Describe what this hook does and when it fires. The command: above is executed.',
  },
  settings: {
    kind: 'settings',
    isConfig: true,
    displayOrder: 2,
    bodyComment:
      'Describe what this settings fragment configures. Fields above are merged into settings.json.',
  },
  // Code kinds — write whole files, may be language-scoped
  prompt: {
    kind: 'prompt',
    isConfig: false,
    displayOrder: 3,
    bodyComment: 'Write the prompt body. Use {{placeholder}} for args.',
  },
  skill: {
    kind: 'skill',
    isConfig: false,
    displayOrder: 4,
    bodyComment: 'Describe what the AI should do when this skill is invoked.',
  },
  agent: {
    kind: 'agent',
    isConfig: false,
    displayOrder: 5,
    bodyComment: 'Define the agent persona and instructions below.',
  },
  rule: {
    kind: 'rule',
    isConfig: false,
    displayOrder: 6,
    bodyComment: 'Add rule bullets below. Extend with extends: for DRY inheritance.',
  },
  workflow: {
    kind: 'workflow',
    isConfig: false,
    displayOrder: 7,
    bodyComment: 'Describe what this workflow does. The steps: list above drives execution order.',
  },
};

// ─── Derived constants ────────────────────────────────────────────────────────

/** All kinds sorted by displayOrder (config first, then code kinds). */
export const ALL_KINDS: ArtifactKind[] = (
  Object.values(KIND_REGISTRY) as KindDescriptor[]
).sort((a, b) => a.displayOrder - b.displayOrder).map(d => d.kind);

/**
 * Canonical kind ordering for selector parsing and grouping sort.
 * Code kinds appear first (author-friendly), config kinds last.
 * This ordering is distinct from displayOrder (which puts config first for the wizard UI).
 */
export const KIND_ORDER: ArtifactKind[] = [
  'skill',
  'agent',
  'rule',
  'prompt',
  'workflow',
  'hook',
  'settings',
  'mcp',
];

/**
 * The set of config-kind identifiers.
 * Derived from KIND_REGISTRY.isConfig — there is exactly one place this list is declared.
 *
 * Replaces:
 *   - select/selection.ts CONFIG_KINDS (now re-exports this)
 *   - manifest/status.ts CONFIG_ENTRY_KINDS (deleted, now imports this)
 *   - types.ts ConfigKind (the type is kept; this is the runtime counterpart)
 */
export const CONFIG_KINDS = new Set<ArtifactKind>(
  ALL_KINDS.filter(k => KIND_REGISTRY[k].isConfig),
);

/**
 * Type-guard: returns true when `k` is any valid artifact kind.
 * Use to validate user-supplied strings before treating them as ArtifactKind.
 */
export function isArtifactKind(k: string): k is ArtifactKind {
  return Object.prototype.hasOwnProperty.call(KIND_REGISTRY, k);
}

/**
 * Type-guard: returns true when `k` is a config-kind artifact kind.
 * Use instead of `CONFIG_KINDS.has(k as ArtifactKind)` for a safer narrowing.
 */
export function isConfigKind(k: string): k is ConfigKind {
  return CONFIG_KINDS.has(k as ArtifactKind);
}
