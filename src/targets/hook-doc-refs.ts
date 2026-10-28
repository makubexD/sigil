/**
 * Citations for the hook files the Copilot target writes (src/targets/copilot/hook-ops.ts), kept
 * beside doc-refs.ts so that file stays under the max-lines limit. Claude Code's own hook citation
 * stays in doc-refs.ts (CLAUDE_HOOKS_DOC).
 *
 * @module
 */
import type { DocRef } from './spec-types';

/**
 * Copilot's hook files — the canonical reference for the schema src/targets/copilot/hook-ops.ts
 * writes: `.github/hooks/*.json` (project), inline `hooks` in `.github/copilot/settings.local.json`
 * (local), and `$COPILOT_HOME/hooks/*.json` (user).
 */
export const COPILOT_HOOKS_DOC: DocRef = {
  url: 'https://docs.github.com/en/copilot/reference/hooks-configuration',
  title: 'GitHub Docs — Hooks configuration reference',
  verifiedOn: '2026-10-28',
  covers:
    'the .github/hooks/*.json and $COPILOT_HOME/hooks file schema { version, hooks: { <event>: ' +
    '[entry] } } and the PascalCase aliases (PreToolUse, PostToolUse, PostToolUseFailure, ' +
    'UserPromptSubmit, SessionStart) that buildCopilotHookOps writes.',
};

/** VS Code's local agent reads the same hook files as Copilot CLI. */
export const VSCODE_HOOKS_DOC: DocRef = {
  url: 'https://code.visualstudio.com/docs/copilot/customization/hooks',
  title: 'VS Code — Agent hooks (Preview)',
  verifiedOn: '2026-10-28',
  covers:
    'VS Code reads the same hook files (.github/hooks/*.json and the other Copilot hook ' +
    'sources) that buildCopilotHookOps writes.',
};
