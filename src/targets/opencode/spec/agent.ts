/**
 * OpenCode `agent` emission spec — a subagent file at `.opencode/agents/<name>.md`. Frontmatter
 * is `description`, `mode` and `permission`, in that order. `mode: subagent` is a constant: a
 * catalog agent is a delegate, never a primary agent. `permission` is the provider-neutral
 * `tools` list rendered through `OPENCODE_AGENT_TOOL_DIALECT` by `opencodePermissionBlock`, with
 * the ordered `'*': deny` first rule and OpenCode's own `read` object.
 *
 * `name` is not written: OpenCode takes the agent name from the file name, and any unknown key is
 * passed to the provider as a model option (D3, docs/decisions/opencode-target-2026-11.md). A
 * stray `name:` would reach the model API rather than be dropped.
 *
 * `model` is not mapped either (D3): OpenCode needs a `provider/model-id`, and a neutral tier has
 * no provider-free id to map to, so the agent inherits the caller's model, as on Cursor.
 *
 * `disallowedTools` is left unmapped on purpose: no catalog agent authors one, so `restrictionOutcome`
 * fails closed (`skip`) on an agent that does rather than widening it. OpenCode could carry it as
 * `<key>: deny` (D3) if a catalog agent ever needs it.
 */
import type { KindEmitSpec, FieldMapping, BodySectionSpec } from '../../spec-types';
import { yamlScalar } from '../../yaml-util';
import { renderBoundarySection } from '../../shared/boundary';
import { OPENCODE_AGENTS_DOC, OPENCODE_PERMS_DOC } from '../doc-refs';
import { OPENCODE_LEXICON } from '../lexicon';
import { UNTRANSLATED_TOKEN_FORBID } from '../../lexicon-forbid';
import { OPENCODE_AGENT_TOOL_DIALECT, opencodePermissionBlock } from '../tool-dialect';

const descriptionMapping: FieldMapping = {
  from: 'description',
  to: 'description',
  required: true,
  serialize: v => `description: ${yamlScalar(v as string)}`,
};

/** A catalog agent is always a subagent, so `mode` is constant and always written. */
const modeMapping: FieldMapping = {
  from: 'id',
  to: 'mode',
  required: true,
  alwaysEmit: true,
  serialize: () => 'mode: subagent',
};

/**
 * `tools` becomes the `permission` block. `when` gates on a non-empty list; an agent with no
 * `tools` keeps OpenCode's every-tool default, so no block is written.
 */
const permissionMapping: FieldMapping = {
  from: 'tools',
  to: 'permission',
  required: false,
  when: fm => Array.isArray(fm.tools) && (fm.tools as string[]).length > 0,
  serialize: v => opencodePermissionBlock(v as string[]),
};

/**
 * Boundary heading for an agent OpenCode locks out of `task`: it cannot delegate, so it names
 * the co-installed agents in its report for the caller to hand the work to instead.
 */
const REPORT_ESCALATES_HEADING =
  'Name these co-installed agents in your report, so the caller can hand the work over:';

/**
 * A non-empty tools list without `agent` makes the permission block deny `task`; no tools keeps
 * OpenCode's every-tool default, so that agent can still delegate.
 */
function cannotDelegate(frontmatter: Record<string, unknown>): boolean {
  const tools = frontmatter.tools;
  return Array.isArray(tools) && tools.length > 0 && !tools.includes('agent');
}

const titleAndBoundarySection: BodySectionSpec = {
  id: 'titleAndBoundary',
  position: 'before',
  render: (artifact, ctx) => [
    `# ${artifact.frontmatter.title as string}`,
    '',
    ...renderBoundarySection(
      artifact,
      ctx.installSet,
      ctx.catalog,
      cannotDelegate(artifact.frontmatter) ? REPORT_ESCALATES_HEADING : undefined,
    ),
  ],
};

export const OPENCODE_AGENT_SPEC: KindEmitSpec = {
  kind: 'agent',
  outputPath: artifact => `.opencode/agents/${artifact.frontmatter.name as string}.md`,
  pathPattern: /\.opencode\/agents\/[^/]+\.md$/,
  frontmatter: [descriptionMapping, modeMapping, permissionMapping],
  emitEmptyFrontmatter: true,
  toolDialect: OPENCODE_AGENT_TOOL_DIALECT,
  body: [titleAndBoundarySection],
  forbiddenKeys: ['name', 'tools', 'model', 'applyTo', 'paths'],
  lexicon: OPENCODE_LEXICON,
  bodyForbids: [UNTRANSLATED_TOKEN_FORBID],
  docs: [OPENCODE_AGENTS_DOC, OPENCODE_PERMS_DOC],
};
