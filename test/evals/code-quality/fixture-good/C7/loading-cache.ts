export function createLoadingCache<V>(load: (key: string) => Promise<V>): {
  get(key: string): Promise<V>;
} {
  const entries = new Map<string, Promise<V>>();
  return {
    get(key) {
      const cached = entries.get(key);
      if (cached) return cached;
      const loading = load(key);
      entries.set(key, loading);
      // A failed load is forgotten so the next get tries again.
      loading.catch(() => {
        if (entries.get(key) === loading) entries.delete(key);
      });
      return loading;
    },
  };
}
