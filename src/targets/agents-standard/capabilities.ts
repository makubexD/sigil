/**
 * What the open-standard target delivers: Agent Skills in `.agents/skills/`, with each skill's
 * rules inlined (rules have no per-file standard; repo-wide ones also go into `AGENTS.md` on a full
 * build). The open standard defines no subagents, user-invoked prompts, workflows or shared
 * config files, so those kinds are skipped with a reason.
 *
 * @module
 */
import { TEMPLATE_NOT_EMITTED, type TargetCapabilities } from '../capability-types';
import { AGENT_SKILLS_SPEC_DOC } from '../doc-refs';

const NO_STANDARD = (what: string) =>
  `the open standard (Agent Skills, AGENTS.md) defines no ${what}; install it for a tool-specific target`;

export const AGENTS_STANDARD_CAPABILITIES: TargetCapabilities = {
  scaffold: {
    skill: { mode: 'native' },
    rule: { mode: 'via', as: 'inline', docs: [AGENT_SKILLS_SPEC_DOC] },
    agent: { mode: 'none', reason: NO_STANDARD('subagents') },
    prompt: { mode: 'none', reason: NO_STANDARD('user-invoked prompts with arguments') },
    workflow: { mode: 'none', reason: NO_STANDARD('workflows') },
    mcp: { mode: 'none', reason: NO_STANDARD('MCP config file shared by its tools') },
    hook: { mode: 'none', reason: NO_STANDARD('hooks') },
    settings: { mode: 'none', reason: NO_STANDARD('settings') },
    template: TEMPLATE_NOT_EMITTED,
  },
};
