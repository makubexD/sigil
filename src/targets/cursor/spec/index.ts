/**
 * Every Cursor KindEmitSpec: the target's `emitSpecs`, which ../../emit-files.ts writes every file
 * through, and the input to deriveContracts() and `sigil sync --stale`.
 */
import type { KindEmitSpec } from '../../spec-types';
import { CURSOR_AGENT_SPEC } from './agent';
import { CURSOR_RULE_SPEC } from './rule';
import { CURSOR_SKILL_SPEC } from './skill';

export const CURSOR_EMIT_SPECS: readonly KindEmitSpec[] = [
  CURSOR_AGENT_SPEC,
  CURSOR_RULE_SPEC,
  CURSOR_SKILL_SPEC,
];
