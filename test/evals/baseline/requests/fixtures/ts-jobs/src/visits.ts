/** Where visit counts are persisted. `save` talks to the database and can fail. */
export const store = {
  async save(userId: string, count: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 20));
    saved.set(userId, count);
  },
};

export const saved = new Map<string, number>();
export const counts = new Map<string, number>();

export function visitsOf(userId: string): number {
  return counts.get(userId) ?? 0;
}
