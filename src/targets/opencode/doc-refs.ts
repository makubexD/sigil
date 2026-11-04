/**
 * Citations specific to the OpenCode target. The shared open-standard ones (the Agent Skills spec
 * and the AGENTS.md standard) live in ../doc-refs.ts.
 *
 * @module
 */
import type { DocRef } from '../spec-types';

/** OpenCode also reads skills from `.agents/skills/` and `.claude/skills/`. */
export const OPENCODE_SKILLS_DOC: DocRef = {
  url: 'https://opencode.ai/docs/skills/',
  title: 'OpenCode — Skills',
  verifiedOn: '2026-11-03',
  covers:
    'OpenCode also reads .agents/skills/ and .claude/skills/; a skill has `name` and ' +
    '`description`.',
};

/** OpenCode subagents are `.opencode/agents/*.md` files. */
export const OPENCODE_AGENTS_DOC: DocRef = {
  url: 'https://opencode.ai/docs/agents/',
  title: 'OpenCode — Agents',
  verifiedOn: '2026-11-03',
  covers:
    'agent files in .opencode/agents/*.md, the `mode` and `permission` keys, and extra keys ' +
    'reaching the model.',
};

/** OpenCode permission rules are ordered, with the last match winning. */
export const OPENCODE_PERMS_DOC: DocRef = {
  url: 'https://opencode.ai/docs/permissions/',
  title: 'OpenCode — Permissions',
  verifiedOn: '2026-11-03',
  covers: 'ordered rules where the last match wins, the object form, and .env defaults.',
};

/** OpenCode commands are `.opencode/commands/*.md` files with `$1`, `` !`cmd` ``, and `@file`. */
export const OPENCODE_COMMANDS_DOC: DocRef = {
  url: 'https://opencode.ai/docs/commands/',
  title: 'OpenCode — Commands',
  verifiedOn: '2026-11-03',
  covers: 'command files in .opencode/commands/*.md, $1, !`cmd`, and @file.',
};

/** OpenCode reads the root `AGENTS.md`; rules cannot be scoped to paths. */
export const OPENCODE_RULES_DOC: DocRef = {
  url: 'https://opencode.ai/docs/rules/',
  title: 'OpenCode — Rules',
  verifiedOn: '2026-11-03',
  covers: 'the root AGENTS.md, with no path scoping.',
};

/** OpenCode hooks are code modules, not a declarative file. */
export const OPENCODE_PLUGINS_DOC: DocRef = {
  url: 'https://opencode.ai/docs/plugins/',
  title: 'OpenCode — Plugins',
  verifiedOn: '2026-11-03',
  covers: 'hooks as code modules, not a declarative file.',
};
