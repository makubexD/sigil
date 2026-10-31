/**
 * Citations for Copilot files no KindEmitSpec renders: `copilot-instructions.md`, the merged MCP
 * files and the merged hook files. Tracked by `sigil sync --stale` beside the spec citations
 * (allProviderDocRefs, ../all-emit-specs.ts).
 *
 * @module
 */
import type { SourcedDocRef } from '../spec-types';
import {
  COPILOT_INSTRUCTIONS_DOC,
  VSCODE_MCP_DOC,
  COPILOT_CLI_MCP_DOC,
  COPILOT_MCP_VARIABLES_DOC,
} from '../doc-refs';
import { COPILOT_HOOKS_DOC, VSCODE_HOOKS_DOC } from '../hook-doc-refs';

export const COPILOT_AGGREGATE_DOCS: readonly SourcedDocRef[] = [
  { source: 'copilot copilot-instructions.md aggregate', doc: COPILOT_INSTRUCTIONS_DOC },
  { source: 'copilot .mcp.json / mcp-config.json aggregate (VS Code)', doc: VSCODE_MCP_DOC },
  {
    source: 'copilot .mcp.json / mcp-config.json aggregate (Copilot CLI)',
    doc: COPILOT_CLI_MCP_DOC,
  },
  { source: 'copilot MCP env references (${NAME})', doc: COPILOT_MCP_VARIABLES_DOC },
  {
    source: 'copilot .github/hooks/sigil.json / settings.local.json hooks aggregate',
    doc: COPILOT_HOOKS_DOC,
  },
  {
    source: 'copilot .github/hooks/sigil.json / settings.local.json hooks aggregate',
    doc: VSCODE_HOOKS_DOC,
  },
];
