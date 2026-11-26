/** True for a line the on-call dashboard counts as an error. */
export function isErrorLine(line: string): boolean {
  return line.includes(' ERROR ');
}
