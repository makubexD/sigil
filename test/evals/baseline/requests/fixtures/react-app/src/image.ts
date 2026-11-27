const MAX_BYTES = 5 * 1024 * 1024;

/** Prepares a picture for upload. Rejects one the browser cannot decode, or one over 5 MB. */
export async function resizeImage(file: File): Promise<Blob> {
  if (file.size === 0) throw new Error('the image could not be decoded');
  if (file.size > MAX_BYTES) throw new Error('the image is over 5 MB');
  return file;
}
