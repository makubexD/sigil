/**
 * Trust scanner public types.
 */

export type ScanSeverity = 'ok' | 'warn' | 'error';

export interface ScanFinding {
  rule: string; // e.g. "secret/aws-key"
  severity: 'warn' | 'error';
  file: string; // path of the scanned file (for display)
  line: number; // 1-based line number, or 0 if unknown
  snippet: string; // short redacted excerpt for context
}

export interface ScanResult {
  /** Aggregate level of all findings: 'ok' when there are none. */
  level: ScanSeverity;
  findings: ScanFinding[];
}
