export interface Profile {
  name: string;
  bio: string;
  website: string;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// Only absolute http(s) URLs become links; anything else (javascript:, data:, relative paths,
// garbage) could run script or point somewhere unexpected when a visitor clicks it.
function isSafeWebsite(website: string): boolean {
  try {
    const { protocol } = new URL(website);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

// All fields are user-supplied and the card is shown to every visitor, so everything is escaped.
export function renderProfileCard(profile: Profile): string {
  const { name, bio, website } = profile;
  const link = isSafeWebsite(website)
    ? `<a href="${escapeHtml(website)}">${escapeHtml(website)}</a>`
    : '';
  return `<div class="profile"><h2>${escapeHtml(name)}</h2><p>${escapeHtml(bio)}</p>${link}</div>`;
}
