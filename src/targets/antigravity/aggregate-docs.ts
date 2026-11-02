/**
 * Citations for Antigravity files no KindEmitSpec renders: the merged MCP config files
 * (.agents/mcp_config.json and ~/.gemini/config/mcp_config.json). Tracked by `sigil sync
 * --stale` beside the spec citations (allProviderDocRefs, ../all-emit-specs.ts).
 *
 * @module
 */
import type { SourcedDocRef } from '../spec-types';
import { ANTIGRAVITY_MCP_DOC } from './doc-refs';

export const ANTIGRAVITY_AGGREGATE_DOCS: readonly SourcedDocRef[] = [
  {
    source: 'antigravity .agents/mcp_config.json / ~/.gemini/config/mcp_config.json aggregate',
    doc: ANTIGRAVITY_MCP_DOC,
  },
];
