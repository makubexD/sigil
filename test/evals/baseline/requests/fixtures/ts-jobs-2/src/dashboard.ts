export interface Dashboard {
  profile: { id: string; name: string };
  orders: string[];
  recommendations: string[];
}

/** The three services behind the dashboard. Each call takes a few hundred milliseconds. */
export interface Api {
  profile(userId: string, signal?: AbortSignal): Promise<Dashboard['profile']>;
  orders(userId: string, signal?: AbortSignal): Promise<string[]>;
  recommendations(userId: string, signal?: AbortSignal): Promise<string[]>;
}
