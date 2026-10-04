/**
 * Flattens every provider doc citation across all KindEmitSpecs, plus the two hand-written
 * aggregate outputs (copilot-instructions.md, AGENTS.md) that have no spec of their own and so
 * cite their DocRef directly (see src/targets/copilot/build-helpers.ts).
 *
 * The sole consumer is `sigil sync --stale` (src/commands/sync/analyze.ts) — this is what makes
 * `KindEmitSpec.docs` actually "tracked by sigil sync --stale" rather than merely declared.
 *
 * @module
 */
import type { DocRef, KindEmitSpec } from './spec-types';
import { CLAUDE_EMIT_SPECS } from './claude-code/spec';
import { COPILOT_EMIT_SPECS } from './copilot/spec';
import { CLAUDE_CAPABILITIES } from './claude-code/capabilities';
import { COPILOT_CAPABILITIES } from './copilot/capabilities';
import { CHANNELS, type TargetCapabilities } from './capability-types';
import { ALL_KINDS } from '../kinds';
import {
  COPILOT_INSTRUCTIONS_DOC,
  VSCODE_INSTRUCTIONS_DOC,
  AGENTS_MD_STANDARD_DOC,
  CLAUDE_DIRECTORY_DOC,
  CLAUDE_MCP_DOC,
  CLAUDE_HOOKS_DOC,
  CLAUDE_SETTINGS_DOC,
  CLAUDE_PLUGIN_MANIFEST_DOC,
  CLAUDE_PLUGIN_MARKETPLACES_DOC,
  VSCODE_MCP_DOC,
  COPILOT_CLI_MCP_DOC,
  VSCODE_VARIABLES_DOC,
} from './doc-refs';

/** One DocRef paired with a human-readable label identifying what cites it. */
export interface SourcedDocRef {
  readonly source: string;
  readonly doc: DocRef;
}

function specLabel(provider: string, spec: KindEmitSpec): string {
  return spec.variant ? `${provider}/${spec.kind} (${spec.variant})` : `${provider}/${spec.kind}`;
}

function specDocs(provider: string, specs: readonly KindEmitSpec[]): SourcedDocRef[] {
  return specs.flatMap(spec => spec.docs.map(doc => ({ source: specLabel(provider, spec), doc })));
}

/**
 * Hand-written aggregate outputs with no KindEmitSpec of their own — see doc-refs.ts.
 * AGENTS.md carries three citations: the open standard itself, plus each consumer's doc for
 * actually reading AGENTS.md (GitHub and VS Code, which diverge on subfolder support — see
 * VSCODE_INSTRUCTIONS_DOC.covers). `claude-directory aggregate` is the provenance for the whole
 * Claude Code mapping this file's Claude citations follow — see doc-refs.ts's header.
 *
 * The six `mcp`/`hook`/`settings`/plugin-manifest entries close the 2026-08-07 audit's citation
 * gap: these kinds are JSON merges and manifests (config.ts, config-scaffold.ts, plugin-assemble.ts,
 * target-helpers.ts), not markdown renders, so no KindEmitSpec exists to carry a `docs:` field —
 * they're cited here the same way copilot-instructions.md/AGENTS.md are.
 */
const AGGREGATE_DOC_REFS: readonly SourcedDocRef[] = [
  { source: 'copilot copilot-instructions.md aggregate', doc: COPILOT_INSTRUCTIONS_DOC },
  { source: 'copilot AGENTS.md aggregate', doc: AGENTS_MD_STANDARD_DOC },
  { source: 'copilot AGENTS.md aggregate', doc: COPILOT_INSTRUCTIONS_DOC },
  { source: 'copilot AGENTS.md aggregate', doc: VSCODE_INSTRUCTIONS_DOC },
  { source: 'claude-directory aggregate', doc: CLAUDE_DIRECTORY_DOC },
  { source: 'claude .mcp.json aggregate', doc: CLAUDE_MCP_DOC },
  { source: 'claude .claude/settings.json hooks aggregate', doc: CLAUDE_HOOKS_DOC },
  { source: 'claude .claude/settings.json aggregate', doc: CLAUDE_SETTINGS_DOC },
  { source: 'claude plugin.json aggregate', doc: CLAUDE_PLUGIN_MANIFEST_DOC },
  { source: 'claude marketplace.json aggregate', doc: CLAUDE_PLUGIN_MARKETPLACES_DOC },
  { source: 'copilot .vscode/mcp.json aggregate', doc: VSCODE_MCP_DOC },
  { source: 'copilot .mcp.json aggregate (Copilot CLI)', doc: COPILOT_CLI_MCP_DOC },
  { source: 'copilot mcp.json env references (VSCODE_MCP_ENV_SYNTAX)', doc: VSCODE_VARIABLES_DOC },
];

/**
 * Citations carried by capability rows (`via` rows, and `none` rows that name a platform limit) —
 * see capability-types.ts. `native` rows cite through their KindEmitSpec instead.
 */
function capabilityDocs(provider: string, capabilities: TargetCapabilities): SourcedDocRef[] {
  return CHANNELS.flatMap(channel => {
    const table = capabilities[channel];
    if (!table) return [];
    return ALL_KINDS.flatMap(kind => {
      const support = table[kind];
      const docs = support.mode === 'native' ? [] : (support.docs ?? []);
      return docs.map(doc => ({ source: `${provider} capability ${channel}/${kind}`, doc }));
    });
  });
}

export const ALL_PROVIDER_DOC_REFS: readonly SourcedDocRef[] = [
  ...specDocs('claude', CLAUDE_EMIT_SPECS),
  ...specDocs('copilot', COPILOT_EMIT_SPECS),
  ...AGGREGATE_DOC_REFS,
  ...capabilityDocs('claude', CLAUDE_CAPABILITIES),
  ...capabilityDocs('copilot', COPILOT_CAPABILITIES),
];

/** One spec paired with its provider-qualified label — the `supersededBy` surfacing input. */
export interface SourcedSpec {
  /** The provider (a registered target's name) whose spec this is; match on this, not `source`. */
  readonly provider: string;
  readonly source: string;
  readonly spec: KindEmitSpec;
}

function sourcedSpecs(provider: string, specs: readonly KindEmitSpec[]): SourcedSpec[] {
  return specs.map(spec => ({ provider, source: specLabel(provider, spec), spec }));
}

/** Every registered provider's specs, labeled — lets `sigil sync --check` walk `supersededBy`
 * without importing `claude-code/spec` and `copilot/spec` directly (see analyze.ts). */
export const ALL_PROVIDER_SPECS: readonly SourcedSpec[] = [
  ...sourcedSpecs('claude', CLAUDE_EMIT_SPECS),
  ...sourcedSpecs('copilot', COPILOT_EMIT_SPECS),
];
