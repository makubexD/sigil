export interface Profile {
  id: string;
  name: string;
}

/** Looks one profile up in the identity service; about 150 ms a call. */
export type FetchProfile = (id: string) => Promise<Profile>;

export function displayName(profile: Profile): string {
  return profile.name.trim() || profile.id;
}
