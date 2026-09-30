/**
 * Output-conformance contracts for Claude Code output — derived from CLAUDE_EMIT_SPECS
 * (spec/index.ts) rather than hand-written. See deriveContracts() (../output-contract.ts) for
 * why: a spec is now the single place that states both what gets emitted and what the emitted
 * file must satisfy. This now covers BOTH scaffold paths (.claude/…) AND plugin-build paths
 * (plugins/<pack>/…) — the previous hand-written table covered scaffold paths only.
 *
 * @module
 */
import type { ContractEntry } from '../../types';
import { deriveContracts } from '../output-contract';
import { CLAUDE_EMIT_SPECS } from './spec';

export const CLAUDE_OUTPUT_CONTRACTS: ContractEntry[] = deriveContracts(CLAUDE_EMIT_SPECS);
