/**
 * Citations for Copilot files no KindEmitSpec renders: `copilot-instructions.md`, `AGENTS.md`
 * (the open standard plus each consumer's doc, since GitHub and VS Code differ on subfolder
 * support) and the merged MCP files. Tracked by `sigil sync --stale` beside the spec citations
 * (allProviderDocRefs, ../all-emit-specs.ts).
 *
 * @module
 */
import type { SourcedDocRef } from '../spec-types';
import {
  COPILOT_INSTRUCTIONS_DOC,
  VSCODE_INSTRUCTIONS_DOC,
  AGENTS_MD_STANDARD_DOC,
  VSCODE_MCP_DOC,
  COPILOT_CLI_MCP_DOC,
  COPILOT_MCP_VARIABLES_DOC,
} from '../doc-refs';

export const COPILOT_AGGREGATE_DOCS: readonly SourcedDocRef[] = [
  { source: 'copilot copilot-instructions.md aggregate', doc: COPILOT_INSTRUCTIONS_DOC },
  { source: 'copilot AGENTS.md aggregate', doc: AGENTS_MD_STANDARD_DOC },
  { source: 'copilot AGENTS.md aggregate', doc: COPILOT_INSTRUCTIONS_DOC },
  { source: 'copilot AGENTS.md aggregate', doc: VSCODE_INSTRUCTIONS_DOC },
  { source: 'copilot .mcp.json / mcp-config.json aggregate (VS Code)', doc: VSCODE_MCP_DOC },
  {
    source: 'copilot .mcp.json / mcp-config.json aggregate (Copilot CLI)',
    doc: COPILOT_CLI_MCP_DOC,
  },
  { source: 'copilot MCP env references (${NAME})', doc: COPILOT_MCP_VARIABLES_DOC },
];
