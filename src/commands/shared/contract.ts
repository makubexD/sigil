/**
 * `renderViolations` — format output-conformance violations for the SigilError hint.
 *
 * Replaces 2 copies of the same "  ✗  [label] file\n       problem" loop across
 * commands/{add,build}.ts.
 *
 * @module
 */
import type { OutputViolation } from '../../types';

/** Renders one line-pair per violation: "  ✗  [label] file" then "       problem". */
export function renderViolations(violations: readonly OutputViolation[]): string {
  return violations.map(v => `  ✗  [${v.label}] ${v.file}\n       ${v.problem}`).join('\n');
}
