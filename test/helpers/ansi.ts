/**
 * ANSI escape-code helpers for test assertions.
 * Import instead of re-declaring the strip regex in each test file.
 */

/**
 * Remove all ANSI SGR escape sequences from a string so assertions
 * are not fragile against terminal-colour changes.
 */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex -- \x1b (ESC) is the ANSI SGR sequence marker
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}
