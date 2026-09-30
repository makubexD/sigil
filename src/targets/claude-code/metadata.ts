/**
 * Static declarative metadata for the Claude Code target adapter — the
 * `sigil patch` authoring surface, init scaffolding dirs,
 * project-detection markers, and display vocabulary.
 *
 * Split out of `index.ts` because none of this is behavior — it's data the
 * `ClaudeCodeTarget` class exposes as readonly fields.
 *
 * @module
 */
import type { ArtifactKind, KindVocabulary, AuthoringField } from '../../types';

/** `sigil patch` authoring surface for the `claude:` frontmatter namespace (agent only). */
export const CLAUDE_AUTHORING_FIELDS: AuthoringField[] = [
  {
    key: 'model',
    description: 'Set claude.model: haiku | sonnet | opus (agent only)',
    kinds: ['agent'],
  },
  {
    key: 'effort',
    description: 'Set claude.effort: low | medium | high (agent only)',
    kinds: ['agent'],
  },
  {
    key: 'max-turns',
    description: 'Set claude.maxTurns (agent only)',
    kinds: ['agent'],
    type: 'int',
  },
  {
    key: 'isolation',
    description: 'Set claude.isolation: worktree (agent only)',
    kinds: ['agent'],
  },
];

/** Directories created by `sigil init --target claude`. */
export const CLAUDE_INIT_DIRS: string[] = ['.claude/skills', '.claude/rules', '.claude/agents'];

/** Presence of .claude/ signals this target is installed in the project. */
export const CLAUDE_PROJECT_MARKERS: string[] = ['.claude'];

/**
 * Claude Code's native artifact vocabulary (verified 2026-08-06).
 * A catalog `prompt`/`workflow` maps to a *user-invoked skill* on Claude Code — neither is a
 * distinct Claude Code artifact type. Per code.claude.com/docs/en/skills: "Custom commands have
 * been merged into skills… Your existing .claude/commands/ files keep working" — sigil no longer
 * writes to that legacy path, but Claude Code itself still reads it if a user has old files there.
 */
export const CLAUDE_VOCABULARY: Partial<Record<ArtifactKind, KindVocabulary>> = {
  skill: { noun: 'skill', plural: 'Skills', hint: 'procedural how-to guides for the AI' },
  agent: { noun: 'agent', plural: 'Agents', hint: 'specialised AI personas (subagents)' },
  rule: { noun: 'rule', plural: 'Rules', hint: 'coding style guidelines loaded as memory' },
  prompt: {
    noun: 'command',
    plural: 'Commands',
    hint: 'custom commands invoked with /name in Claude Code',
  },
  workflow: { noun: 'workflow', plural: 'Workflows', hint: 'multi-step automated workflows' },
  hook: { noun: 'hook', plural: 'Hooks', hint: 'event hooks (pre/post-tool, stop, etc.)' },
  settings: { noun: 'setting', plural: 'Settings', hint: 'settings.json fragments' },
  mcp: { noun: 'MCP server', plural: 'MCPs', hint: 'external MCP servers' },
};
