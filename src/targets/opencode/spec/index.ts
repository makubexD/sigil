/**
 * Every OpenCode KindEmitSpec: the target's `emitSpecs`, which ../../emit-files.ts writes every
 * file through, and the input to deriveContracts() and `sigil sync --stale`.
 */
import type { KindEmitSpec } from '../../spec-types';
import { OPENCODE_AGENT_SPEC } from './agent';
import { OPENCODE_PROMPT_SPEC } from './prompt';
import { OPENCODE_SKILL_SPEC } from './skill';

export const OPENCODE_EMIT_SPECS: readonly KindEmitSpec[] = [
  OPENCODE_AGENT_SPEC,
  OPENCODE_PROMPT_SPEC,
  OPENCODE_SKILL_SPEC,
];
