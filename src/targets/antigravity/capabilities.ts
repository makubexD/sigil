/**
 * What the Antigravity target delivers: Agent Skills in `.agents/skills/`, with each skill's
 * rules inlined. Rules as `.agents/rules/` files, subagents, prompts, workflows, MCP config and
 * hooks are not built yet; a prompt and a workflow have no Antigravity file at all, since
 * workflows stopped working and a skill is the slash command. The CLI owns its settings file.
 *
 * @module
 */
import { TEMPLATE_NOT_EMITTED, type TargetCapabilities } from '../capability-types';
import { ANTIGRAVITY_WORKFLOWS_DOC } from './doc-refs';

export const ANTIGRAVITY_CAPABILITIES: TargetCapabilities = {
  scaffold: {
    skill: { mode: 'native' },
    rule: { mode: 'none', reason: 'not built yet (roadmap Phase B)' },
    agent: { mode: 'none', reason: 'not built yet (roadmap Phase D)' },
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
    mcp: { mode: 'none', reason: 'not built yet (roadmap Phase C)' },
    hook: { mode: 'none', reason: 'not built yet (roadmap Phase E)' },
    settings: { mode: 'none', reason: 'the CLI owns its settings file' },
    template: TEMPLATE_NOT_EMITTED,
  },
};
