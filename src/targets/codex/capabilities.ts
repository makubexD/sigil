/**
 * What the Codex target delivers: Agent Skills in `.agents/skills/`, with each skill's rules
 * inlined (rules have no per-file format; repo-wide ones also go into `AGENTS.md` on a full build),
 * plus hooks merged into `.codex/hooks.json` / `$CODEX_HOME/hooks.json` and MCP servers merged
 * into `.codex/config.toml` / `$CODEX_HOME/config.toml`. Codex has no tool-restricting subagents,
 * custom prompts are deprecated, and its settings file is Claude Code's own vocabulary.
 *
 * @module
 */
import { TEMPLATE_NOT_EMITTED, type TargetCapabilities } from '../capability-types';
import { CODEX_CUSTOM_PROMPTS_DOC, CODEX_SKILLS_DOC, CODEX_SUBAGENTS_DOC } from './doc-refs';

export const CODEX_CAPABILITIES: TargetCapabilities = {
  scaffold: {
    skill: { mode: 'native' },
    rule: { mode: 'via', as: 'inline', docs: [CODEX_SKILLS_DOC] },
    agent: {
      mode: 'none',
      reason: "a Codex agent file can't restrict tools, so a catalog agent would gain every tool",
      docs: [CODEX_SUBAGENTS_DOC],
    },
    prompt: {
      mode: 'none',
      reason: 'Codex custom prompts are deprecated in favor of skills',
      docs: [CODEX_CUSTOM_PROMPTS_DOC],
    },
    workflow: { mode: 'none', reason: 'Codex has no workflow file' },
    mcp: { mode: 'native' },
    hook: { mode: 'native' },
    settings: { mode: 'none', reason: "this kind's schema is Claude Code's own vocabulary" },
    template: TEMPLATE_NOT_EMITTED,
  },
};
