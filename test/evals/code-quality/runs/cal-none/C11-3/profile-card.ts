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

// Profile fields are user-supplied and rendered for every visitor, so only
// http(s) URLs may become links; anything else (javascript:, data:, relative
// paths, garbage) would let one user run script or redirect in another's session.
function safeWebsiteUrl(website: string): string | null {
  let url: URL;
  try {
    url = new URL(website.trim());
  } catch {
    return null;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? website.trim() : null;
}

export function renderProfileCard(profile: Profile): string {
  const url = safeWebsiteUrl(profile.website);
  const link = url === null ? '' : `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;
  return `<div class="profile"><h2>${escapeHtml(profile.name)}</h2><p>${escapeHtml(profile.bio)}</p>${link}</div>`;
}
