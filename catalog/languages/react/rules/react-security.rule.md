---
id: react/react-security
kind: rule
title: Security (React)
description: React/browser security invariants — XSS, dangerouslySetInnerHTML, client-exposed secrets, redirect validation
language: react
severity: required
appliesTo:
  - "**/*.tsx"
  - "**/*.jsx"
tags:
  - react
  - security
appliesToRationale: Scoped to component files because these are React/browser-runtime security invariants, not project-config concerns.
---

## Security

- `dangerouslySetInnerHTML` bypasses React's escaping. Never pass unsanitized user or third-party content to it:
  run it through `DOMPurify.sanitize` first, or render plain text.
- A variable prefixed `NEXT_PUBLIC_` or `VITE_` ships to the browser: no secret goes there, and a server-only
  secret is never passed into a `"use client"` component's props.
- A redirect target taken from a query parameter is checked against an allowlist; at least require a path that
  starts with `/` and not `//`.
- A third-party script from a CDN carries `integrity` (SRI), and a component that injects a `<script>` is checked
  against the Content-Security-Policy.
- Session tokens live in an httpOnly, Secure cookie set by the server, not `localStorage`; never a long-lived
  refresh token in client storage.
- A cookie-authenticated app sends state-changing requests with `SameSite` cookies and a CSRF token.
