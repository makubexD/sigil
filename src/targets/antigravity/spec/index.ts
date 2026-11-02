/**
 * Every Antigravity KindEmitSpec: the target's `emitSpecs`, which ../../emit-files.ts writes every
 * file through, and the input to deriveContracts() and `sigil sync --stale`.
 */
import type { KindEmitSpec } from '../../spec-types';
import { ANTIGRAVITY_SKILL_SPEC } from './skill';

export const ANTIGRAVITY_EMIT_SPECS: readonly KindEmitSpec[] = [ANTIGRAVITY_SKILL_SPEC];
