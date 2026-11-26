/** Longest preview the link card shows. */
export const PREVIEW_LENGTH = 200;

export function truncate(text: string): string {
  return text.length > PREVIEW_LENGTH ? text.slice(0, PREVIEW_LENGTH) : text;
}
