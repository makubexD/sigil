/** Resizes one image on disk; each call holds about 50 MB while it runs. */
export type Resize = (path: string) => Promise<void>;

export function thumbnailName(path: string): string {
  return path.replace(/(\.[a-z]+)$/i, '.thumb$1');
}
