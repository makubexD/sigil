/**
 * Static declarative metadata for the Copilot target adapter — init scaffolding dirs,
 * project-detection markers, and display vocabulary.
 *
 * Split out of `index.ts` because none of this is behavior — it's data the
 * `CopilotTarget` class exposes as readonly fields.
 *
 * @module
 */
import type { ArtifactKind, KindVocabulary } from '../../types';

/** Directories created by `sigil init --target copilot`. */
export const COPILOT_INIT_DIRS: string[] = [
  '.github/instructions',
  '.github/prompts',
  '.github/agents',
];

/**
 * Any of these signals Copilot is set up in the project. A bare `.github/` does not: most GitHub
 * repositories have one for workflows and issue templates and never used Copilot customisation.
 */
export const COPILOT_PROJECT_MARKERS: string[] = [
  '.github/copilot-instructions.md',
  '.github/instructions',
  '.github/prompts',
  '.github/agents',
  '.github/skills',
];

/**
 * GitHub Copilot's native artifact vocabulary (verified 2026-08-07).
 * A catalog `rule` maps to *instructions* on Copilot — "rule" is not a Copilot term.
 * A catalog `prompt` maps to a *prompt file* — "command" is not a Copilot artifact type.
 * Both platforms share the Agent Skills open standard for `skill`.
 */
export const COPILOT_VOCABULARY: Partial<Record<ArtifactKind, KindVocabulary>> = {
  skill: {
    noun: 'skill',
    plural: 'Skills',
    hint: 'Agent Skills (open standard, agentskills.io)',
  },
  agent: {
    noun: 'agent',
    plural: 'Agents',
    hint: 'custom agents (invoked as @name in Copilot Chat)',
  },
  rule: {
    noun: 'instructions',
    plural: 'Instructions',
    hint: 'coding guidelines (.instructions.md with applyTo)',
  },
  prompt: {
    noun: 'prompt',
    plural: 'Prompts',
    hint: 'prompt files invoked as /name in Copilot Chat',
  },
  workflow: { noun: 'prompt', plural: 'Prompts', hint: 'multi-step workflows as prompt files' },
  mcp: { noun: 'MCP server', plural: 'MCPs', hint: 'external MCP servers' },
};
