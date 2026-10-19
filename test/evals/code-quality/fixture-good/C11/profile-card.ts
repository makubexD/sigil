const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for use in HTML content or a double-quoted attribute value. */
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, ch => ENTITIES[ch]);

/** Renders a profile card; every field is user-typed, so all of it is escaped and only http(s) links render. */
export function renderProfileCard(profile: { name: string; bio: string; website: string }): string {
  const { name, bio, website } = profile;
  const link = /^https?:\/\//i.test(website)
    ? `<a href="${escapeHtml(website)}">${escapeHtml(website)}</a>`
    : '';
  return `<div class="profile"><h2>${escapeHtml(name)}</h2><p>${escapeHtml(bio)}</p>${link}</div>`;
}
