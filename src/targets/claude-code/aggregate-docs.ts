/**
 * Citations for Claude Code files no KindEmitSpec renders: the `.claude/` layout as a whole, the
 * merged config files (`.mcp.json`, settings and hooks) and the plugin manifests. Tracked by
 * `sigil sync --stale` beside the spec citations (allProviderDocRefs, ../all-emit-specs.ts).
 *
 * @module
 */
import type { SourcedDocRef } from '../spec-types';
import {
  CLAUDE_DIRECTORY_DOC,
  CLAUDE_MCP_DOC,
  CLAUDE_HOOKS_DOC,
  CLAUDE_SETTINGS_DOC,
  CLAUDE_PLUGIN_MANIFEST_DOC,
  CLAUDE_PLUGIN_MARKETPLACES_DOC,
} from '../doc-refs';

export const CLAUDE_AGGREGATE_DOCS: readonly SourcedDocRef[] = [
  { source: 'claude-directory aggregate', doc: CLAUDE_DIRECTORY_DOC },
  { source: 'claude .mcp.json aggregate', doc: CLAUDE_MCP_DOC },
  { source: 'claude .claude/settings.json hooks aggregate', doc: CLAUDE_HOOKS_DOC },
  { source: 'claude .claude/settings.json aggregate', doc: CLAUDE_SETTINGS_DOC },
  { source: 'claude plugin.json aggregate', doc: CLAUDE_PLUGIN_MANIFEST_DOC },
  { source: 'claude marketplace.json aggregate', doc: CLAUDE_PLUGIN_MARKETPLACES_DOC },
];
