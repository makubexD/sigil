/**
 * What the OpenCode target delivers: Agent Skills in `.agents/skills/` (each skill's rules
 * inlined), subagents in `.opencode/agents/`, commands in `.opencode/commands/`, repo-wide
 * rules in the root `AGENTS.md`, and MCP servers merged into `.opencode/opencode.json` (project)
 * or `$XDG_CONFIG_HOME/opencode/opencode.json` (user). This is the scaffold channel only; the
 * target defines no plugin channel. OpenCode has no workflow file, its hooks are code modules on
 * a plugin API OpenCode 2 doesn't run, and the catalog's `settings` kind is Claude Code's own
 * vocabulary.
 *
 * @module
 */
import { TEMPLATE_NOT_EMITTED, type TargetCapabilities } from '../capability-types';
import { OPENCODE_PLUGINS_DOC, OPENCODE_SKILLS_DOC } from './doc-refs';

export const OPENCODE_CAPABILITIES: TargetCapabilities = {
  scaffold: {
    skill: { mode: 'native' },
    agent: { mode: 'native' },
    prompt: { mode: 'native' },
    rule: { mode: 'via', as: 'inline', docs: [OPENCODE_SKILLS_DOC] },
    workflow: { mode: 'none', reason: 'OpenCode has no workflow file' },
    hook: {
      mode: 'none',
      reason: "OpenCode hooks are generated code on a plugin API OpenCode 2 doesn't run",
      docs: [OPENCODE_PLUGINS_DOC],
    },
    mcp: { mode: 'native' },
    settings: { mode: 'none', reason: "this kind's schema is Claude Code's own vocabulary" },
    template: TEMPLATE_NOT_EMITTED,
  },
};
