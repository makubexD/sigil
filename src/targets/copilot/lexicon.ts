/**
 * GitHub Copilot's body-lexicon values — see ../lexicon.ts for what this is and why. Every
 * KindEmitSpec in ./spec/ shares this one table (imported directly, not re-declared per spec).
 */
import type { ProviderLexicon } from '../lexicon';
import {
  COPILOT_AGENT_SKILLS_DOC,
  COPILOT_INSTRUCTIONS_DOC,
  VSCODE_AGENT_SKILLS_DOC,
} from '../doc-refs';

export const COPILOT_LEXICON: ProviderLexicon = {
  // COPILOT_INSTRUCTIONS_DOC documents AGENTS.md as the agent-instructions file Copilot reads,
  // valid anywhere in the repo — the direct Copilot counterpart to CLAUDE.md.
  'conventions-file': { value: 'AGENTS.md', doc: COPILOT_INSTRUCTIONS_DOC },
  'rules-dir': { value: '.github/instructions/', doc: COPILOT_INSTRUCTIONS_DOC },
  'skills-dir': { value: '.github/skills/', doc: COPILOT_AGENT_SKILLS_DOC },
  // Copilot Agent Skills have no $ARGUMENTS-equivalent invocation-argument mechanism — a skill
  // dispatches on description relevance alone (see whenToUseSection, copilot/spec/skill.ts).
  arguments: { value: 'the request you were given', doc: VSCODE_AGENT_SKILLS_DOC },
};
