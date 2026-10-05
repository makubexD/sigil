/**
 * Every open-standard KindEmitSpec: the target's `emitSpecs`, which ../../emit-files.ts writes
 * every file through, and the input to deriveContracts() and `sigil sync --stale`.
 */
import type { KindEmitSpec } from '../../spec-types';
import { AGENTS_STANDARD_SKILL_SPEC } from './skill';

export const AGENTS_STANDARD_EMIT_SPECS: readonly KindEmitSpec[] = [AGENTS_STANDARD_SKILL_SPEC];
