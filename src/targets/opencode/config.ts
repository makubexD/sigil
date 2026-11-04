/**
 * OpenCode's config kinds as data (src/targets/config-kind-table.ts).
 *
 *   mcp   project → .opencode/opencode.json at the project root (root: project)
 *         user    → opencode.json under $XDG_CONFIG_HOME/opencode, default
 *                   ~/.config/opencode (root: opencode-home)
 *         local   → refused: OpenCode has no personal per-project config file (use project or user)
 *
 * `OPENCODE_CONFIG_KINDS` is the table the target dispatches every config install through;
 * destinationFor derives the local refusal from it. The builder references stay inside arrow
 * wrappers because mcp-ops.ts imports `OPENCODE_CONFIG_KINDS` back from this module — a cycle
 * whose imported binding must only be read when an op is built, never while this module
 * initializes.
 *
 * OPENCODE_MCP_DOC documents the `mcp` map and the `local` / `remote` server shapes;
 * OPENCODE_CONFIG_DOC the `opencode.json` layers and `{env:NAME}` expansion.
 *
 * @module
 */
import type { ConfigKindTable } from '../config-kind-table';
import { buildOpenCodeMcpOps, openCodeMcpSkipReason } from './mcp-ops';

/** OpenCode's config kinds: MCP servers in the `mcp` map of `opencode.json`. */
export const OPENCODE_CONFIG_KINDS: ConfigKindTable = {
  mcp: {
    section: 'mcp',
    destinations: {
      project: {
        file: '.opencode/opencode.json',
        root: 'project',
        display: '.opencode/opencode.json, git-committed',
      },
      user: {
        file: 'opencode.json',
        root: 'opencode-home',
        display:
          '$XDG_CONFIG_HOME/opencode/opencode.json, default ~/.config/opencode/opencode.json',
      },
    },
    buildOps: (artifact, scope) => buildOpenCodeMcpOps(artifact, scope),
    skipReason: artifact => openCodeMcpSkipReason(artifact),
  },
};
