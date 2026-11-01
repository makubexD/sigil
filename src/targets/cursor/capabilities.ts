/**
 * What the Cursor target delivers: Agent Skills in `.cursor/skills/`, with each skill's rules
 * inlined. Rules (`.mdc`), subagents, commands, hooks and MCP config are not built yet; Cursor's
 * settings file is Claude Code's own vocabulary and it has no workflow file.
 *
 * @module
 */
import { TEMPLATE_NOT_EMITTED, type TargetCapabilities } from '../capability-types';
import {
  CURSOR_COMMANDS_DOC,
  CURSOR_HOOKS_DOC,
  CURSOR_MCP_DOC,
  CURSOR_RULES_DOC,
  CURSOR_SUBAGENTS_DOC,
} from './doc-refs';

export const CURSOR_CAPABILITIES: TargetCapabilities = {
  scaffold: {
    skill: { mode: 'native' },
    rule: { mode: 'none', reason: 'not built yet', docs: [CURSOR_RULES_DOC] },
    agent: {
      mode: 'none',
      reason:
        'not built yet: a Cursor subagent has no tool list, so a read-only one needs `readonly: true`',
      docs: [CURSOR_SUBAGENTS_DOC],
    },
    prompt: {
      mode: 'none',
      reason: 'Cursor is folding commands into skills (/migrate-to-skills)',
      docs: [CURSOR_COMMANDS_DOC],
    },
    workflow: { mode: 'none', reason: 'Cursor has no workflow file' },
    hook: { mode: 'none', reason: 'not built yet', docs: [CURSOR_HOOKS_DOC] },
    mcp: { mode: 'none', reason: 'not built yet', docs: [CURSOR_MCP_DOC] },
    settings: { mode: 'none', reason: "this kind's schema is Claude Code's own vocabulary" },
    template: TEMPLATE_NOT_EMITTED,
  },
};
