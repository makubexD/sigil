export interface Session {
  userId: string;
  token: string;
  /** Unix time in seconds, as the identity service returns it. */
  expiresAt: number;
}

const sessions = new Map<string, Session>();

export function createSession(userId: string, ttlSeconds: number): Session {
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const session = { userId, token, expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds };
  sessions.set(userId, session);
  return session;
}

export function verifySession(userId: string, presentedToken: string): boolean {
  const session = sessions.get(userId);
  if (!session) return false;
  if (session.expiresAt < Date.now()) {
    sessions.delete(userId);
    return false;
  }
  return session.token === presentedToken;
}
