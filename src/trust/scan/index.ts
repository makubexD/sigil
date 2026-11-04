/**
 * trust/scan — lightweight security scanner for catalog artifacts.
 *
 * Sub-modules:
 *   types     — ScanSeverity, ScanFinding, ScanResult
 *   rules     — RULES array, RULE_DESCRIPTIONS
 *   scanner   — scanContent, formatScanFindings
 */
export type { ScanSeverity, ScanFinding, ScanResult } from './types';
export { RULE_DESCRIPTIONS } from './rules';
export { scanContent, formatScanFindings } from './scanner';
