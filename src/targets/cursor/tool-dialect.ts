/**
 * Cursor's agent `ToolDialect` (../tool-dialect.ts): a Cursor subagent file has no tool list at
 * all, only the `readonly` switch, so an authored list collapses to one boolean.
 *
 * `CURSOR_SUBAGENTS_DOC` (./doc-refs.ts) describes `readonly` as "restricted write permissions
 * (no file edits, no state-changing shell commands)". Probe A7
 * (docs/decisions/cursor-target-2026-11.md) found it tighter: a `readonly: true` subagent runs
 * in Ask mode, where a write and both shell calls tried (`touch`, `ls -la`) were refused while
 * Glob worked. `shell` is therefore not read-only here: a list naming it is inexact and only
 * maps nearest.
 *
 * `readOnly` is what the nearest mapping grants and `writes` (`edit`) what clears it
 * (docs/plan-cursor-target-e.md Decisions 1, 2 and 4): a read-only list narrows with the flag,
 * while a list naming an edit tool gets no flag and so every Cursor tool.
 *
 * @module
 */
import type { ToolDialect } from '../tool-dialect';

/** The Cursor agent dialect: `readonly: true` only for a list with no write tool. */
export const CURSOR_AGENT_TOOL_DIALECT: ToolDialect = {
  kind: 'read-only-flag',
  readOnly: ['read', 'search'],
  writes: ['edit'],
};
