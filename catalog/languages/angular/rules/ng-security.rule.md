---
id: angular/ng-security
kind: rule
title: Security (Angular)
description: Angular security invariants — no client-side secrets, XSS/sanitization, injection prevention, safe I/O
language: angular
appliesTo:
  - "**/*.ts"
  - "**/*.html"
severity: required
tags:
  - angular
  - security
appliesToRationale: Scoped to TypeScript and HTML because the two threat surfaces this rule covers are split across them — secret handling and HTTP construction live in TypeScript, while XSS-relevant bindings live in templates.
---

## Security

- Everything in the bundle is public: no credentials, tokens or keys in source, `environment*.ts`, logs or error
  messages. The client gets short-lived tokens from a server at runtime.
- Never call `bypassSecurityTrust*` on untrusted input; any call carries a comment saying why the content is
  trusted. `[innerHTML]` binds only sanitized or static content.
- No `eval`, `new Function(...)` or template compilation from user data; no `element.innerHTML =` or
  `document.write`.
- Build query strings with `HttpParams`. A URL or host built from user input is allowlisted before a request or a
  redirect. Tokens go in headers through an interceptor, never in a URL.
- A route guard or an `@if` on a role is UX only; the server authorizes every privileged operation.
- Tokens and IDs come from `crypto.getRandomValues()` or `crypto.randomUUID()`, never `Math.random()`.
- No tokens or PII in `localStorage` / `sessionStorage`: in-memory tokens or `HttpOnly` cookies set by the server.
