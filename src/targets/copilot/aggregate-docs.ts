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
  VSCODE_VARIABLES_DOC,
} from '../doc-refs';

export const COPILOT_AGGREGATE_DOCS: readonly SourcedDocRef[] = [
  { source: 'copilot copilot-instructions.md aggregate', doc: COPILOT_INSTRUCTIONS_DOC },
  { source: 'copilot AGENTS.md aggregate', doc: AGENTS_MD_STANDARD_DOC },
  { source: 'copilot AGENTS.md aggregate', doc: COPILOT_INSTRUCTIONS_DOC },
  { source: 'copilot AGENTS.md aggregate', doc: VSCODE_INSTRUCTIONS_DOC },
  { source: 'copilot .vscode/mcp.json aggregate', doc: VSCODE_MCP_DOC },
  { source: 'copilot .mcp.json aggregate (Copilot CLI)', doc: COPILOT_CLI_MCP_DOC },
  { source: 'copilot mcp.json env references (VSCODE_MCP_ENV_SYNTAX)', doc: VSCODE_VARIABLES_DOC },
];
