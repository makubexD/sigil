/**
 * Claude Code's capability table — which kinds this target delivers per channel. The single
 * declaration of Claude kind support (see ../capability-types.ts); edit a row here, never a
 * hand-listed kind array elsewhere.
 *
 * @module
 */
import { TEMPLATE_NOT_EMITTED, type TargetCapabilities } from '../capability-types';
import { CLAUDE_PLUGIN_COMPONENTS_DOC } from '../doc-refs';

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
    prompt: { mode: 'native' },
    hook: { mode: 'native' },
    mcp: { mode: 'native' },
    settings: {
      mode: 'none',
      reason: 'a plugin settings.json applies only `agent` and `subagentStatusLine`',
      docs: [CLAUDE_PLUGIN_COMPONENTS_DOC],
    },
    template: TEMPLATE_NOT_EMITTED,
  },
};
