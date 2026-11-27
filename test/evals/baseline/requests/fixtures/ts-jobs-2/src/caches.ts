/** Loads one key into the cache; rejects when the origin cannot be reached. */
export type Warm = (key: string) => Promise<void>;
