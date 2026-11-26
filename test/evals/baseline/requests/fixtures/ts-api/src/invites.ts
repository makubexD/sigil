export interface Invite {
  email: string;
  code: string;
  createdAt: Date;
}

const invites = new Map<string, Invite>();

export function saveInvite(invite: Invite): void {
  invites.set(invite.email, invite);
}

export function findInvite(email: string): Invite | undefined {
  return invites.get(email);
}
