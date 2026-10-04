/**
 * Copilot `prompt` emission spec — `.prompt.md`, invoked as `/name` in Copilot Chat. Also reused
 * for `workflow` (Copilot has no native workflow type; a workflow emits through this exact same
 * shape so it's invocable as a slash command too — see
 * COPILOT_WORKFLOW_SPEC below, built from the same field mappings via buildPromptLikeSpec() so
 * the two kinds can never drift apart in shape).
 *
 * `applyTo` is NOT valid here — it belongs only in `.instructions.md` (spec/rule.ts). `agent:` is
 * the current field name (renamed from `mode:` in recent Copilot docs). `{{name}}` placeholders
 * translate to `${input:name}` — the two-part form, deliberately: the three-part
 * `${input:name:placeholder}` breaks when a description contains a colon.
 */
import type { ArtifactKind } from '../../../types';
import type { KindEmitSpec, FieldMapping } from '../../spec-types';
import { yamlScalar } from '../../yaml-util';
import { toCopilotPlaceholders } from '../../prompt-args';
import { COPILOT_AGENT_SKILLS_DOC, COPILOT_PROMPT_FILES_DOC } from '../../doc-refs';
import { COPILOT_LEXICON } from '../lexicon';
import { UNTRANSLATED_TOKEN_FORBID } from '../../lexicon-forbid';

const agentMapping: FieldMapping = {
  from: 'kind', // any always-present field works as the trigger; the value is hardcoded below
  to: 'agent',
  required: true,
  alwaysEmit: true,
  serialize: () => 'agent: agent',
};

const descriptionMapping: FieldMapping = {
  from: 'description',
  to: 'description',
  required: true,
  serialize: v => `description: ${yamlScalar(v as string)}`,
};

const toolsMapping: FieldMapping = {
  from: 'kind',
  to: 'tools',
  required: true,
  alwaysEmit: true,
  serialize: () => 'tools:\n  - codebase\n  - github',
};

// VS Code's own prompt-files doc (see COPILOT_PROMPT_FILES_DOC.covers) now warns: "Agents running
// on the Agent Host don't use prompt files… convert it to an agent skill." This does NOT change
// emission here — see spec-types.ts's KindEmitSpec.supersededBy header for why a format-
// supersession flag isn't itself a trigger to migrate — but it's now surfaced by
// `sigil sync --check` instead of only being discoverable by the next manual audit. Applies
// equally to workflow, which inherits the same prompt-file rendering.
const PROMPT_FILE_SUPERSEDED_BY = {
  by: 'copilot/skill',
  note: 'VS Code documents prompt files as not read by the Agent Host; recommends agent skills.',
  doc: COPILOT_AGENT_SKILLS_DOC,
};

/**
 * Builds the shared prompt-file KindEmitSpec for `kind`, varying only the `kind` discriminator —
 * `prompt` and `workflow` render through byte-identical field mappings, path, and body rules
 * because Copilot has no native workflow type (see module header). Never hand-copy this shape;
 * add a second call site here if a third kind ever needs the same rendering.
 */
function buildPromptLikeSpec(kind: ArtifactKind): KindEmitSpec {
  return {
    kind,
    outputPath: artifact => `.github/prompts/${artifact.id.replace(/\//g, '-')}.prompt.md`,
    pathPattern: /\.github\/prompts\/.*\.prompt\.md$/,
    bodyTransform: toCopilotPlaceholders,
    frontmatter: [agentMapping, descriptionMapping, toolsMapping],
    emitEmptyFrontmatter: true,
    body: [],
    forbiddenKeys: ['applyTo', 'name', 'paths', 'argument-hint', 'arguments'],
    lexicon: COPILOT_LEXICON,
    bodyForbids: [
      { pattern: /\{\{/, reason: 'unresolved {{…}} placeholder (should be translated)' },
      UNTRANSLATED_TOKEN_FORBID,
    ],
    docs: [COPILOT_PROMPT_FILES_DOC],
    supersededBy: PROMPT_FILE_SUPERSEDED_BY,
  };
}

export const COPILOT_PROMPT_SPEC: KindEmitSpec = buildPromptLikeSpec('prompt');

/** See buildPromptLikeSpec's header — workflow has no native Copilot type, so it renders as a prompt file. */
export const COPILOT_WORKFLOW_SPEC: KindEmitSpec = buildPromptLikeSpec('workflow');
