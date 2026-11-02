/**
 * What the Antigravity target delivers.
 *
 * Scaffold (`sigil add`): Agent Skills in `.agents/skills/`, with each skill's rules inlined,
 * repo-wide rules as always-on `.agents/rules/` files, subagents in `.agents/agents/`, hooks
 * merged into `.agents/hooks.json` (project) or `~/.gemini/config/hooks.json` (user), and MCP
 * servers merged into `.agents/mcp_config.json` (project) or `~/.gemini/config/mcp_config.json`
 * (user). A scoped rule is skipped per artifact by the rule spec's `skipReason` (ADR probe B1
 * found no glob trigger attaches). Prompts and workflows are not built yet; a prompt and a
 * workflow have no Antigravity file at all, since workflows stopped working and a skill is the
 * slash command. The CLI owns its settings file.
 *
 * Plugin (`sigil build`): skills, repo-wide rules and subagents ship in pack plugins; each hook
 * and MCP artifact gets its own generated plugin. The closed `plugin.json` schema has no settings
 * field, so settings stays unsupported there too.
 *
 * @module
 */
import { TEMPLATE_NOT_EMITTED, type TargetCapabilities } from '../capability-types';
import { ANTIGRAVITY_BUILD_PLUGINS_DOC, ANTIGRAVITY_WORKFLOWS_DOC } from './doc-refs';

export const ANTIGRAVITY_CAPABILITIES: TargetCapabilities = {
  scaffold: {
    skill: { mode: 'native' },
    rule: { mode: 'native' },
    agent: { mode: 'native' },
    prompt: {
      mode: 'none',
      reason:
        'Antigravity has no prompt files: workflows stopped working and a skill is the slash command',
      docs: [ANTIGRAVITY_WORKFLOWS_DOC],
    },
    workflow: {
      mode: 'none',
      reason:
        'Antigravity has no prompt files: workflows stopped working and a skill is the slash command',
      docs: [ANTIGRAVITY_WORKFLOWS_DOC],
    },
    mcp: { mode: 'native' },
    hook: { mode: 'native' },
    settings: { mode: 'none', reason: 'the CLI owns its settings file' },
    template: TEMPLATE_NOT_EMITTED,
  },
  plugin: {
    skill: { mode: 'native' },
    rule: { mode: 'native' },
    agent: { mode: 'native' },
    prompt: {
      mode: 'none',
      reason:
        'Antigravity has no prompt files: workflows stopped working and a skill is the slash command',
      docs: [ANTIGRAVITY_WORKFLOWS_DOC],
    },
    workflow: {
      mode: 'none',
      reason:
        'Antigravity has no prompt files: workflows stopped working and a skill is the slash command',
      docs: [ANTIGRAVITY_WORKFLOWS_DOC],
    },
    mcp: { mode: 'native' },
    hook: { mode: 'native' },
    settings: {
      mode: 'none',
      reason: 'the manifest schema has no settings field',
      docs: [ANTIGRAVITY_BUILD_PLUGINS_DOC],
    },
    template: TEMPLATE_NOT_EMITTED,
  },
};
