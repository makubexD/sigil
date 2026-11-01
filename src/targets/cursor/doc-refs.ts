/**
 * Citations specific to the Cursor target. The shared open-standard ones (the Agent Skills spec
 * and the AGENTS.md standard) live in ../doc-refs.ts.
 *
 * @module
 */
import type { DocRef } from '../spec-types';

/** Cursor loads project skills from `.cursor/skills/`, the folder layout this target writes. */
export const CURSOR_SKILLS_DOC: DocRef = {
  url: 'https://cursor.com/docs/context/skills',
  title: 'Cursor — Agent Skills',
  verifiedOn: '2026-10-03',
  covers:
    'Cursor loads project skills from .agents/skills/ (and .cursor/skills/), each a folder with ' +
    'a SKILL.md and optional references/ — the layout the open-standard target writes.',
};

/** Cursor project rules are `.mdc` files in `.cursor/rules/`. */
export const CURSOR_RULES_DOC: DocRef = {
  url: 'https://cursor.com/docs/context/rules',
  title: 'Cursor — Rules',
  verifiedOn: '2026-11-01',
  covers:
    'project rules as .mdc files in .cursor/rules/: alwaysApply vs globs scoping, and the ' +
    'guidance to keep rules under 500 lines.',
};

/** Cursor subagent files cannot list tools, which is why catalog agents are skipped. */
export const CURSOR_SUBAGENTS_DOC: DocRef = {
  url: 'https://cursor.com/docs/context/subagents',
  title: 'Cursor — Subagents',
  verifiedOn: '2026-11-01',
  covers:
    'Cursor subagent files: a subagent has no tool list, so a read-only one is declared with ' +
    '`readonly: true`.',
};

/** Cursor custom commands are being folded into skills, which is why catalog prompts are skipped. */
export const CURSOR_COMMANDS_DOC: DocRef = {
  url: 'https://cursor.com/docs/context/commands',
  title: 'Cursor — Commands',
  verifiedOn: '2026-11-01',
  covers: 'custom commands, being folded into skills via /migrate-to-skills.',
};

/** Cursor hook files — `hooks.json`. */
export const CURSOR_HOOKS_DOC: DocRef = {
  url: 'https://cursor.com/docs/agent/hooks',
  title: 'Cursor — Hooks',
  verifiedOn: '2026-11-01',
  covers: 'Cursor hooks, configured in hooks.json.',
};

/** Cursor MCP servers — `.cursor/mcp.json`. */
export const CURSOR_MCP_DOC: DocRef = {
  url: 'https://cursor.com/docs/context/mcp',
  title: 'Cursor — Model Context Protocol (MCP)',
  verifiedOn: '2026-11-01',
  covers: 'MCP servers configured in .cursor/mcp.json.',
};
