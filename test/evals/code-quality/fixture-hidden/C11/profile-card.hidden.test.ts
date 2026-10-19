import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderProfileCard } from '../src/profile-card.ts';

/** Every href value in the output, as written. */
const hrefs = (html: string): string[] =>
  [...html.matchAll(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map(m => m[1] ?? m[2] ?? m[3]);

test('renders name, bio and website', () => {
  assert.equal(
    renderProfileCard({ name: 'Ada', bio: 'Engineer', website: 'https://ada.dev' }),
    '<div class="profile"><h2>Ada</h2><p>Engineer</p><a href="https://ada.dev">https://ada.dev</a></div>',
  );
});

test('omits the link when website is empty', () => {
  assert.equal(
    renderProfileCard({ name: 'Grace', bio: 'Admiral', website: '' }),
    '<div class="profile"><h2>Grace</h2><p>Admiral</p></div>',
  );
});

test('an http website with a path is a link', () => {
  assert.equal(
    renderProfileCard({ name: 'Linus', bio: 'Kernel', website: 'http://example.org/linus' }),
    '<div class="profile"><h2>Linus</h2><p>Kernel</p><a href="http://example.org/linus">http://example.org/linus</a></div>',
  );
});

test('escapes markup in the name', () => {
  const html = renderProfileCard({ name: '<script>alert(1)</script>', bio: 'hi', website: '' });
  assert.ok(!html.includes('<script'), html);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), html);
});

test('escapes ampersands in the bio', () => {
  const html = renderProfileCard({ name: 'Tom', bio: 'Tom & Jerry &lt;3', website: '' });
  assert.ok(html.includes('<p>Tom &amp; Jerry &amp;lt;3</p>'), html);
});

test('a quote in the website cannot break out of the href', () => {
  const html = renderProfileCard({
    name: 'Mallory',
    bio: 'hi',
    website: 'https://evil.example/" onmouseover="alert(1)',
  });
  for (const tag of html.matchAll(/<a\b([^>]*)>/gi)) {
    const names = [...tag[1].matchAll(/\s*([^\s"'>/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g)].map(m =>
      m[1].toLowerCase(),
    );
    assert.deepEqual(names, ['href'], html);
  }
});

test('a javascript: website is not a link', () => {
  for (const website of ['javascript:alert(document.cookie)', 'JavaScript:alert(1)']) {
    const html = renderProfileCard({ name: 'Mallory', bio: 'hi', website });
    for (const href of hrefs(html)) assert.match(href, /^https?:\/\//i, html);
  }
});
