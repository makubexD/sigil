/**
 * GitHub Copilot's capability table — which kinds this target delivers per channel. The single
 * declaration of Copilot kind support (see ../capability-types.ts). No `plugin` channel yet:
 * whether the Claude-format marketplace already serves Copilot is Phase 4 of the distribution ADR.
 *
 * @module
 */
import { TEMPLATE_NOT_EMITTED, type TargetCapabilities } from '../capability-types';

/** hook/settings frontmatter is Claude Code's own vocabulary (KIND_REGISTRY `ownedBy: ['claude']`). */
const CLAUDE_OWNED =
  "this kind's schema is Claude Code's own vocabulary — sigil has no Copilot emitter for it";

export const COPILOT_CAPABILITIES: TargetCapabilities = {
  scaffold: {
    skill: { mode: 'native' },
    agent: { mode: 'native' },
    rule: { mode: 'native' },
    prompt: { mode: 'native' },
    workflow: { mode: 'native' },
    mcp: { mode: 'native' },
    hook: { mode: 'none', reason: CLAUDE_OWNED },
    settings: { mode: 'none', reason: CLAUDE_OWNED },
    template: TEMPLATE_NOT_EMITTED,
  },
};
