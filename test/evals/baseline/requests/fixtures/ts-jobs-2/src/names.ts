/** "ada lovelace" becomes "Ada Lovelace". */
export function titleCase(name: string): string {
  return name.replace(/\b[a-z]/g, letter => letter.toUpperCase());
}
