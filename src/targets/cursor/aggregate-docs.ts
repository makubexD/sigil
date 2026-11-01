/**
 * Citations for Cursor files no KindEmitSpec renders: the merged config files
 * (.cursor/hooks.json and ~/.cursor/hooks.json; .cursor/mcp.json and ~/.cursor/mcp.json). Tracked
 * by `sigil sync --stale` beside the spec citations (allProviderDocRefs, ../all-emit-specs.ts).
 *
 * @module
 */
import type { SourcedDocRef } from '../spec-types';
import { CURSOR_HOOKS_DOC, CURSOR_MCP_DOC } from './doc-refs';

export const CURSOR_AGGREGATE_DOCS: readonly SourcedDocRef[] = [
  { source: 'cursor .cursor/hooks.json / ~/.cursor/hooks.json aggregate', doc: CURSOR_HOOKS_DOC },
  { source: 'cursor .cursor/mcp.json / ~/.cursor/mcp.json aggregate', doc: CURSOR_MCP_DOC },
];
