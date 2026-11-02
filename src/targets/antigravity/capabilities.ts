/**
 * What the Antigravity target delivers: Agent Skills in `.agents/skills/`, with each skill's
 * rules inlined, repo-wide rules as always-on `.agents/rules/` files, subagents in
 * `.agents/agents/`, and MCP servers merged into `.agents/mcp_config.json` (project) or
 * `~/.gemini/config/mcp_config.json` (user). A scoped rule is skipped per artifact by the rule
 * spec's `skipReason` (ADR probe B1 found no glob trigger attaches). Prompts, workflows and hooks
 * are not built yet; a prompt and a workflow have no Antigravity file at all, since workflows
 * stopped working and a skill is the slash command. The CLI owns its settings file.
 *
 * @module
 */
import { TEMPLATE_NOT_EMITTED, type TargetCapabilities } from '../capability-types';
import { ANTIGRAVITY_WORKFLOWS_DOC } from './doc-refs';

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
    hook: { mode: 'none', reason: 'not built yet (roadmap Phase E)' },
    settings: { mode: 'none', reason: 'the CLI owns its settings file' },
    template: TEMPLATE_NOT_EMITTED,
  },
};
