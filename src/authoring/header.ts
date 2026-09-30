/**
 * Schema-derived minimal header generator for catalog artifacts.
 *
 * Design principles:
 *   - Required keys are emitted as active YAML (derived from the zod schema — never drifts).
 *   - Optional keys are emitted as YAML comments (discoverable, not noise).
 *   - `platforms:` is written active only when the user explicitly restricts (DRY default = omit).
 *   - No body structure imposed — body left as a single placeholder line.
 *   - Every field the wizard gathers is wired through HeaderValues to the emitted header.
 *   - Adding a new kind = add one entry to KIND_HEADER_BUILDERS (compile error if omitted).
 *
 * Per-kind builder functions live in header-builders.ts (split out to stay under the file's
 * max-lines cap); the HeaderValues type lives in header-types.ts so both files can import it
 * without a cycle.
 */

import type { ArtifactKind } from '../types';
import { KIND_REGISTRY } from '../kinds';
import type { HeaderValues } from './header-types';
import {
  buildSkillLines,
  buildAgentLines,
  buildRuleLines,
  buildPromptLines,
  buildWorkflowLines,
  buildHookLines,
  buildSettingsLines,
  buildTemplateLines,
  buildMcpLines,
} from './header-builders';

export type { HeaderValues } from './header-types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap a string value for safe YAML emission (double-quote to handle special chars). */
function yamlStr(s: string): string {
  // Escape inner double-quotes
  return `"${s.replace(/"/g, '\\"')}"`;
}

/** Emit a folded YAML string (>-) for multi-line description values. */
function descriptionBlock(desc: string): string[] {
  return ['description: >-', `  ${desc}`];
}

// ─── Per-kind header builders ─────────────────────────────────────────────────
//
// Record<ArtifactKind, …> enforces that every kind has a builder — adding a kind
// to the ArtifactKind union without adding a builder here is a compile error.
// Each builder returns only the kind-specific YAML lines (shared fields are added
// by the caller `headerFor`).

type KindHeaderBuilder = (v: HeaderValues) => string[];

const KIND_HEADER_BUILDERS: Record<ArtifactKind, KindHeaderBuilder> = {
  skill: buildSkillLines,
  agent: buildAgentLines,
  rule: buildRuleLines,
  prompt: buildPromptLines,
  workflow: buildWorkflowLines,
  hook: buildHookLines,
  settings: buildSettingsLines,
  mcp: buildMcpLines,
  template: buildTemplateLines,
};

// ─── Main export ──────────────────────────────────────────────────────────────

/** Shared required keys (BaseFields): id, kind, title, description. */
function buildSharedRequiredLines(kind: string, v: HeaderValues): string[] {
  return [
    `id: ${v.id}`,
    `kind: ${kind}`,
    `title: ${yamlStr(v.title || `TODO — ${v.name ?? kind}`)}`,
    ...descriptionBlock(v.description || 'TODO — one-line description used in catalog listings.'),
  ];
}

/** `platforms:` — active only when restricting; otherwise a DRY-default comment placeholder. */
function buildPlatformsLines(v: HeaderValues): string[] {
  if (v.platforms && v.platforms.length > 0) {
    return [
      'platforms:',
      ...v.platforms.map(p => `  - ${p}`),
      '# Remove the platforms: field (or run: sigil retarget <id> --to all)',
      '# to propagate this artifact to every AI that supports its kind.',
    ];
  }
  return [
    '# platforms:     # omit to propagate to ALL supporting AIs (DRY default)',
    '#                # or list: [claude, copilot] to restrict',
    '#                # change later: sigil retarget <id> --add <platform>',
  ];
}

/**
 * Generate a minimal, schema-derived frontmatter header for a catalog artifact.
 *
 * Returns the full file string (frontmatter block + single body placeholder).
 * Callers should write this to the appropriate path under catalog/.
 *
 * Required keys (from the zod schema) are emitted as active YAML.
 * Optional keys are emitted as YAML comments — discoverable but not noise.
 * `platforms:` is active only when restricted (absent = all supporting targets).
 */
export function headerFor(kind: string, v: HeaderValues): string {
  const builder = KIND_HEADER_BUILDERS[kind as ArtifactKind];
  // Unknown kind — emit a generic placeholder so the file is at least valid YAML.
  const kindSpecificLines = builder ? builder(v) : ['# Add kind-specific fields here'];

  const descriptor = KIND_REGISTRY[kind as ArtifactKind];
  const bodyComment = descriptor?.bodyComment ?? 'TODO: Add content below.';

  const lines: string[] = [
    '---',
    ...buildSharedRequiredLines(kind, v),
    ...kindSpecificLines,
    '# tags:          # discovery tags []',
    '# version:       # per-artifact semver (optional; package version is the default)',
    ...buildPlatformsLines(v),
    '---',
    '',
    `<!-- ${bodyComment} -->`,
    '',
  ];

  return lines.join('\n') + '\n';
}
