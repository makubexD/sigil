export interface LoginRequest {
  email: string;
  password: string;
  headers: Record<string, string>;
}

/** Checks the credentials with the identity service. */
export type Authenticate = (email: string, password: string) => Promise<boolean>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
