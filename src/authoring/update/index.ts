/**
 * authoring/update — kind-aware artifact-field patcher for the `sigil patch` command.
 *
 * Sub-modules:
 *   descriptors  — FieldDescriptor registry (COMMON_FIELDS, KIND_FIELDS, getEditableFields)
 *   patch-build  — UpdateOps, PatchResult, buildFieldPatch (per-field-group decomposition)
 *   apply        — ApplyResult, applyPatchTransactionally (write + validate + rollback)
 */
export type { FieldDescriptor } from './descriptors';
export { COMMON_FIELDS, KIND_FIELDS, getEditableFields } from './descriptors';

export type { UpdateOps, PatchResult } from './patch-build';
export { buildFieldPatch } from './patch-build';

export type { ApplyResult } from './apply';
export { applyPatchTransactionally } from './apply';
