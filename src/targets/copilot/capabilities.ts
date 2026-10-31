/**
 * GitHub Copilot's capability table — which kinds this target delivers per channel. The single
 * declaration of Copilot kind support (see ../capability-types.ts). No `plugin` channel: sigil emits
 * no Copilot plugin, and Copilot reads the Claude one
 * (docs/decisions/copilot-plugin-channel-2026-10.md).
 *
 * @module
 */
import { TEMPLATE_NOT_EMITTED, type TargetCapabilities } from '../capability-types';

/** settings frontmatter is Claude Code's own vocabulary (KIND_REGISTRY `ownedBy: ['claude']`). */
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
    hook: { mode: 'native' },
    settings: { mode: 'none', reason: CLAUDE_OWNED },
    template: TEMPLATE_NOT_EMITTED,
  },
};
