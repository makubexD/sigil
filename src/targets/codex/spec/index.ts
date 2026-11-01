/**
 * Every Codex KindEmitSpec: the target's `emitSpecs`, which ../../emit-files.ts writes every file
 * through, and the input to deriveContracts() and `sigil sync --stale`.
 */
import type { KindEmitSpec } from '../../spec-types';
import { CODEX_SKILL_SPEC } from './skill';

export const CODEX_EMIT_SPECS: readonly KindEmitSpec[] = [CODEX_SKILL_SPEC];
