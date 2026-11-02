/**
 * What the Cursor target delivers: Agent Skills in `.cursor/skills/` (each skill's rules
 * inlined), rules as `.mdc` files in `.cursor/rules/`, subagents in `.cursor/agents/`, hooks
 * merged into `.cursor/hooks.json` / `~/.cursor/hooks.json`, and MCP servers into
 * `.cursor/mcp.json` / `~/.cursor/mcp.json`. Commands are not built yet; Cursor's settings file
 * is Claude Code's own vocabulary and it has no workflow file.
 *
 * @module
 */
import { TEMPLATE_NOT_EMITTED, type TargetCapabilities } from '../capability-types';
import { CURSOR_COMMANDS_DOC } from './doc-refs';

export const CURSOR_CAPABILITIES: TargetCapabilities = {
  scaffold: {
    skill: { mode: 'native' },
    rule: { mode: 'native' },
    agent: { mode: 'native' },
    prompt: {
      mode: 'none',
      reason: 'Cursor is folding commands into skills (/migrate-to-skills)',
      docs: [CURSOR_COMMANDS_DOC],
    },
    workflow: { mode: 'none', reason: 'Cursor has no workflow file' },
    hook: { mode: 'native' },
    mcp: { mode: 'native' },
    settings: { mode: 'none', reason: "this kind's schema is Claude Code's own vocabulary" },
    template: TEMPLATE_NOT_EMITTED,
  },
};
