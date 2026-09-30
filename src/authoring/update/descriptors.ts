/**
 * Kind-aware field registry: declares which frontmatter fields can be patched
 * via the `sigil patch` command and what values each field accepts.
 */
import type { ArtifactKind } from '../../types';
import { CONFIG_SCOPES } from '../../types';

export interface FieldDescriptor {
  /** Dot-notation path used in error messages (e.g. 'claude.model'). */
  field: string;
  /** 'scalar' = single value; 'list' = array that supports add/remove/set. */
  kind: 'scalar' | 'list';
  /** For enum scalars — valid values. */
  allowedValues?: readonly string[];
  /** If true, clearing this field to empty is an error. */
  required?: boolean;
}

/** Fields editable on ALL artifact kinds. */
export const COMMON_FIELDS: FieldDescriptor[] = [
  { field: 'title', kind: 'scalar', required: true },
  { field: 'description', kind: 'scalar', required: true },
  { field: 'tags', kind: 'list' },
  { field: 'version', kind: 'scalar' },
];

/** Kind-specific editable fields (added to COMMON_FIELDS). */
export const KIND_FIELDS: Record<ArtifactKind, FieldDescriptor[]> = {
  skill: [
    { field: 'appliesTo', kind: 'list' },
    { field: 'uses.rules', kind: 'list' },
    { field: 'uses.agents', kind: 'list' },
  ],
  agent: [
    { field: 'tools', kind: 'list' },
    { field: 'disallowedTools', kind: 'list' },
    { field: 'claude.model', kind: 'scalar', allowedValues: ['haiku', 'sonnet', 'opus'] as const },
    { field: 'claude.effort', kind: 'scalar', allowedValues: ['low', 'medium', 'high'] as const },
    { field: 'claude.maxTurns', kind: 'scalar' },
    { field: 'claude.isolation', kind: 'scalar', allowedValues: ['worktree'] as const },
  ],
  rule: [
    { field: 'appliesTo', kind: 'list' },
    {
      field: 'severity',
      kind: 'scalar',
      allowedValues: ['required', 'recommended', 'optional'] as const,
    },
    { field: 'extends', kind: 'list' },
  ],
  prompt: [{ field: 'appliesTo', kind: 'list' }],
  workflow: [],
  hook: [
    {
      field: 'event',
      kind: 'scalar',
      allowedValues: [
        'PreToolUse',
        'PostToolUse',
        'UserPromptSubmit',
        'SubagentStop',
        'Stop',
        'SessionStart',
        'Notification',
      ] as const,
    },
    { field: 'matcher', kind: 'scalar' },
    { field: 'command', kind: 'scalar', required: true },
    { field: 'timeout', kind: 'scalar' },
    { field: 'defaultScope', kind: 'scalar', allowedValues: CONFIG_SCOPES },
  ],
  settings: [
    { field: 'permissions.allow', kind: 'list' },
    { field: 'permissions.deny', kind: 'list' },
    { field: 'permissions.ask', kind: 'list' },
    { field: 'model', kind: 'scalar' },
    { field: 'env', kind: 'scalar' },
    { field: 'defaultScope', kind: 'scalar', allowedValues: CONFIG_SCOPES },
  ],
  mcp: [
    { field: 'server.command', kind: 'scalar' },
    { field: 'server.url', kind: 'scalar' },
    { field: 'server.type', kind: 'scalar', allowedValues: ['http', 'sse'] as const },
    { field: 'defaultScope', kind: 'scalar', allowedValues: CONFIG_SCOPES },
  ],
};

/** Returns all editable fields for a given artifact kind. */
export function getEditableFields(kind: ArtifactKind): FieldDescriptor[] {
  return [...COMMON_FIELDS, ...(KIND_FIELDS[kind] ?? [])];
}
