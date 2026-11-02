/**
 * Citations specific to the Antigravity target. The shared open-standard ones (the Agent Skills
 * spec and the AGENTS.md standard) live in ../doc-refs.ts.
 *
 * @module
 */
import type { DocRef } from '../spec-types';

/** Antigravity loads project skills from `.agents/skills/`, the Agent Skills layout. */
export const ANTIGRAVITY_SKILLS_DOC: DocRef = {
  url: 'https://antigravity.google/docs/skills#cli-skill-locations',
  title: 'Antigravity — Skills',
  verifiedOn: '2026-11-01',
  covers: 'project skills in .agents/skills/<name>/SKILL.md, the Agent Skills layout',
};

/** Antigravity's rule files, their trigger, and their per-file size limit. */
export const ANTIGRAVITY_RULES_DOC: DocRef = {
  url: 'https://antigravity.google/docs/rules#where-rules-are-stored',
  title: 'Antigravity — Rules',
  verifiedOn: '2026-11-01',
  covers:
    'AGENTS.md and .agents/rules/*.md with a trigger (always_on, model_decision, glob, manual); ' +
    'each file is truncated at 24,000 bytes',
};

/** Antigravity has no workflow files: a skill is the slash command. */
export const ANTIGRAVITY_WORKFLOWS_DOC: DocRef = {
  url: 'https://antigravity.google/docs/migration/workflows-to-skills',
  title: 'Antigravity — Migrating workflows to skills',
  verifiedOn: '2026-11-01',
  covers: 'workflows stopped working on 2026-10-19; a skill is the slash command',
};

/** Antigravity's MCP files and the server shapes they accept. */
export const ANTIGRAVITY_MCP_DOC: DocRef = {
  url: 'https://antigravity.google/docs/mcp#mcp-configuration-structure',
  title: 'Antigravity — MCP',
  verifiedOn: '2026-11-02',
  covers:
    '.agents/mcp_config.json and ~/.gemini/config/mcp_config.json, an mcpServers map; ' +
    'stdio command + args + env + cwd, remote serverUrl or url + headers; ' +
    'no env syntax documented for these files (P5: none expanded)',
};

/** How Antigravity resolves a server name present in both MCP files. */
export const ANTIGRAVITY_SETTINGS_DOC: DocRef = {
  url: 'https://antigravity.google/docs/settings#other-configuration-files',
  title: 'Antigravity — Settings',
  verifiedOn: '2026-11-02',
  covers: 'on a key in both MCP files, the server already running keeps it',
};
