/**
 * Citations specific to the Codex target. The shared open-standard ones (the Agent Skills spec and
 * the AGENTS.md standard) live in ../doc-refs.ts.
 *
 * @module
 */
import type { DocRef } from '../spec-types';

/** Codex loads project skills from `.agents/skills/`, the open-standard layout this target writes. */
export const CODEX_SKILLS_DOC: DocRef = {
  url: 'https://learn.chatgpt.com/docs/build-skills',
  title: 'OpenAI Codex — Build skills',
  verifiedOn: '2026-10-31',
  covers:
    'project skills in .agents/skills/<name>/SKILL.md — the folder layout and SKILL.md format ' +
    'Codex loads, the same open-standard layout the agents-standard target writes.',
};

/** Codex reads the repository instructions file as a root `AGENTS.md`. */
export const CODEX_AGENTS_MD_DOC: DocRef = {
  url: 'https://learn.chatgpt.com/docs/agent-configuration/agents-md',
  title: 'OpenAI Codex — AGENTS.md',
  verifiedOn: '2026-10-31',
  covers:
    'the AGENTS.md repository instructions file Codex reads (not in an explicitly untrusted ' +
    'project, unlike skills).',
};

/** Codex agent files cannot restrict tools, which is why catalog agents are skipped. */
export const CODEX_SUBAGENTS_DOC: DocRef = {
  url: 'https://learn.chatgpt.com/docs/agent-configuration/subagents',
  title: 'OpenAI Codex — Subagents',
  verifiedOn: '2026-10-31',
  covers:
    'Codex agent files: a subagent cannot restrict tools or override the parent sandbox, so a ' +
    'catalog agent rendered for Codex would gain every tool.',
};

/** Codex custom prompts are deprecated and home-scoped, which is why catalog prompts are skipped. */
export const CODEX_CUSTOM_PROMPTS_DOC: DocRef = {
  url: 'https://learn.chatgpt.com/docs/custom-prompts',
  title: 'OpenAI Codex — Custom prompts',
  verifiedOn: '2026-10-31',
  covers:
    'custom prompts are deprecated in favor of skills and live only in the home directory, so ' +
    'they are not a project-scoped artifact.',
};

/** Codex hook files — the schema src/targets/codex/hook-ops.ts writes. */
export const CODEX_HOOKS_DOC: DocRef = {
  url: 'https://learn.chatgpt.com/docs/hooks',
  title: 'OpenAI Codex — Hooks',
  verifiedOn: '2026-10-31',
  covers:
    'Codex hook files (.codex/hooks.json project, $CODEX_HOME/hooks.json user): the ' +
    '{ hooks: { <event>: [{ matcher, hooks: [entry] }] } } schema, the documented events, and the ' +
    'command / commandWindows / timeout entry fields buildCodexHookOps writes.',
};

/** Codex MCP servers — the `[mcp_servers.<name>]` tables src/targets/codex/mcp-ops.ts writes. */
export const CODEX_MCP_DOC: DocRef = {
  url: 'https://learn.chatgpt.com/docs/extend/mcp',
  title: 'OpenAI Codex — Model Context Protocol (MCP)',
  verifiedOn: '2026-10-31',
  covers:
    'the [mcp_servers.<name>] config.toml tables Codex reads: stdio servers (command, args, env, ' +
    'cwd) and streamable-HTTP servers (url, http_headers), with env variables forwarded by name ' +
    'via env_vars rather than ${NAME} expansion.',
};
