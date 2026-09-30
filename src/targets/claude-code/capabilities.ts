/**
 * Claude Code's capability table — which kinds this target delivers per channel. The single
 * declaration of Claude kind support (see ../capability-types.ts); edit a row here, never a
 * hand-listed kind array elsewhere.
 *
 * @module
 */
import { TEMPLATE_NOT_EMITTED, type TargetCapabilities } from '../capability-types';
import { CLAUDE_PLUGIN_COMPONENTS_DOC } from '../doc-refs';

/** Shown for kinds sigil could package as plugins but doesn't yet (distribution ADR, Phase 0/1). */
const NOT_YET_PACKAGED =
  'sigil does not package this kind into plugins yet — install it with `sigil add`';

export const CLAUDE_CAPABILITIES: TargetCapabilities = {
  scaffold: {
    skill: { mode: 'native' },
    agent: { mode: 'native' },
    rule: { mode: 'native' },
    prompt: { mode: 'native' },
    workflow: { mode: 'native' },
    hook: { mode: 'native' },
    settings: { mode: 'native' },
    mcp: { mode: 'native' },
    template: TEMPLATE_NOT_EMITTED,
  },
  plugin: {
    skill: { mode: 'native' },
    agent: { mode: 'native' },
    workflow: { mode: 'native' },
    rule: { mode: 'via', as: 'inline', docs: [CLAUDE_PLUGIN_COMPONENTS_DOC] },
    prompt: { mode: 'none', reason: NOT_YET_PACKAGED },
    hook: { mode: 'none', reason: NOT_YET_PACKAGED },
    mcp: { mode: 'none', reason: NOT_YET_PACKAGED },
    settings: {
      mode: 'none',
      reason: 'a plugin settings.json applies only `agent` and `subagentStatusLine`',
      docs: [CLAUDE_PLUGIN_COMPONENTS_DOC],
    },
    template: TEMPLATE_NOT_EMITTED,
  },
};
