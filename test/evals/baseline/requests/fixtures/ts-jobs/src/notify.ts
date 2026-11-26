export interface User {
  id: string;
  email: string;
}

/** Sends one notification through the mail provider; about 150 ms a call, and it can reject. */
export type Send = (user: User) => Promise<void>;

export function hasEmail(user: User): boolean {
  return user.email.includes('@');
}
