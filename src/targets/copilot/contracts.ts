/**
 * Output-conformance contracts for Copilot output — derived from COPILOT_EMIT_SPECS
 * (spec/index.ts) rather than hand-written. See deriveContracts() (../output-contract.ts) for
 * why: a spec is now the single place that states both what gets emitted and what the emitted
 * file must satisfy.
 *
 * @module
 */
import type { ContractEntry } from '../../types';
import { deriveContracts } from '../output-contract';
import { COPILOT_EMIT_SPECS } from './spec';

export const COPILOT_OUTPUT_CONTRACTS: ContractEntry[] = deriveContracts(COPILOT_EMIT_SPECS);
