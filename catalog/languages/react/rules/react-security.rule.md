---
id: react/react-security
kind: rule
title: Security (React)
description: React/browser security invariants — XSS, dangerouslySetInnerHTML, client-exposed secrets, redirect validation
language: react
severity: required
appliesTo:
  - "**/*.tsx"
tags:
  - react
  - security
appliesToRationale: Scoped to component files because these are React/browser-runtime security invariants, not project-config concerns.
---

## `dangerouslySetInnerHTML` Requires Sanitization

React escapes JSX text content by default — that protection is bypassed entirely by
`dangerouslySetInnerHTML`. Never pass unsanitized user or third-party content to it; run it through
a sanitizer (`DOMPurify`) first:

```tsx
// Correct — sanitized before rendering
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userSuppliedHtml) }} />

// Wrong — direct XSS if userSuppliedHtml contains a <script> or event-handler attribute
<div dangerouslySetInnerHTML={{ __html: userSuppliedHtml }} />
```

Prefer rendering as plain text (`{content}`) whenever the content doesn't genuinely need to be HTML
— it needs no sanitization step at all and can't regress into an XSS hole later.

## Client-Exposed Environment Variables Are Public

Any variable prefixed `NEXT_PUBLIC_`/`VITE_` (or otherwise bundled into client JavaScript) is
visible to anyone who opens devtools — it is **not** a place for a secret, even a "low-risk" one.
A real API secret, signing key, or admin token must stay server-only (an unprefixed variable read
only in a Server Component, API route, or server action) and never be threaded down into a Client
Component's props.

```tsx
// Wrong — a server-only secret passed into a Client Component ships to the browser bundle
"use client";
export function Widget({ apiSecret }: { apiSecret: string }) { ... }

// Correct — the secret stays server-side; the client only receives the data it fetched with it
// (Server Component fetches with the secret, passes only the resulting data down)
```

## Unvalidated Redirects

Never build a redirect target directly from a URL query parameter without validating it against an
allowlist of known-safe paths — an open redirect (`?returnTo=https://evil.example.com`) is a
common phishing vector layered on top of a trusted domain.

```tsx
function safeRedirect(target: string): string {
  return target.startsWith("/") && !target.startsWith("//") ? target : "/";
}
```

## Third-Party Scripts and Content

Loading a third-party script (`<script src="...">`, an embedded iframe) grants it execution
context in your page. Use Subresource Integrity (`integrity="sha384-..."`) for any third-party
script pulled from a CDN, and set a Content-Security-Policy header restricting `script-src` to known
origins — this is typically a Next.js `next.config.js`/middleware concern, but any component that
injects a `<script>` tag dynamically must be reviewed against the CSP.

## Auth Token Storage

Prefer an httpOnly, Secure cookie set by the server for session tokens over `localStorage` —
`localStorage` is readable by any script running on the page, so an XSS hole anywhere in the app
(including a third-party dependency) can exfiltrate the token. If a client-readable token is
genuinely required (e.g., for a client-side API call), scope its lifetime short and never store a
long-lived refresh token there.

## CSRF on State-Changing Requests

For a cookie-authenticated app, state-changing requests (POST/PATCH/DELETE) must carry CSRF
protection — a same-site cookie attribute (`SameSite=Lax`/`Strict`) plus a server-validated CSRF
token for `Strict`-incompatible cross-site flows. A token-header-authenticated API (Bearer token in
an `Authorization` header, not a cookie) is inherently CSRF-safe since a cross-site form cannot set
a custom header — but confirm the app is actually using that model before relying on it.

See `react-logging` for the related no-PII invariant and `react-security-auditor` for a systematic
sweep of these patterns across the whole codebase.
