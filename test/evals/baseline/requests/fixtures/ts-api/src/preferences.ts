export type Preferences = { [key: string]: unknown };

/** What a user gets before saving anything. */
export const DEFAULTS: Preferences = {
  language: 'en',
  theme: { mode: 'light', accent: 'blue' },
  notifications: { email: true, sms: false },
};
