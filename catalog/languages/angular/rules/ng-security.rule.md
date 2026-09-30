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
extends: []
tags:
  - angular
  - security
---


## Secrets and Credentials
Anything compiled into the application bundle is **public** — users can read it in DevTools.
Credentials, tokens, API keys, and signing secrets **must never** appear in source, in
`environment.ts` / `environment.prod.ts`, in log statements, or in error messages. Authenticate
against a server that holds the secret; the client receives only short-lived, scoped tokens
obtained at runtime. Document required server-side variables in the README — never their values.

```ts
// Wrong — shipped to every browser
export const environment = { apiKey: 'sk_live_abc123' };

// Right — the client calls a backend that holds the secret
const token = await this.auth.getAccessToken(); // obtained at runtime, short-lived
```

## Cross-Site Scripting (XSS)
Angular contextually auto-escapes interpolation (`{{ value }}`) and property bindings — rely on it.
- **Never** call `bypassSecurityTrust*` (`bypassSecurityTrustHtml`, `…Url`, `…ResourceUrl`, …) on
  untrusted input. Each call is an explicit hole in the sanitizer; use it only for content you
  fully control, with a comment justifying it.
- Bind `[innerHTML]` only to sanitized or statically-trusted content. Prefer rendering structured
  data over injecting raw HTML.
- Treat `DomSanitizer` as a last resort, not a convenience.

```ts
// Wrong — untrusted markup bypasses the sanitizer
this.html = this.sanitizer.bypassSecurityTrustHtml(userSuppliedMarkup);

// Right — let Angular sanitize on binding
// template: <div [innerHTML]="userSuppliedMarkup"></div>
```

## Template / Code Injection
Never compile templates or evaluate expressions from untrusted input: no `eval`, no
`new Function(...)`, no dynamic component/template compilation driven by user data. Build UI from
typed data and the framework's declarative bindings instead.

## URL and HTTP Construction
- Build query parameters with `HttpParams`, not string concatenation, so values are encoded.
- Validate and **allowlist** any URL or host assembled from user input before issuing a request
  (SSRF and open-redirect vector); never redirect to a raw user-supplied URL.
- Never place credentials or tokens in a URL — use headers (and let an interceptor attach them).

```ts
// Right — encoded params, fixed base URL
const params = new HttpParams().set('q', userQuery);
this.http.get(`${this.baseUrl}/search`, { params });
```

## Trusted Types / CSP
Where the app enforces a Content-Security-Policy and Trusted Types, keep DOM writes going through
Angular's bindings and sanitizer so policy violations don't appear at runtime. Avoid direct
`element.innerHTML =` / `document.write` assignments.

## Authorization Is Server-Side
Route guards and `*ngIf`/`@if` on a role are **UX only** — they hide UI, they do not protect data.
Every privileged operation must be authorized again on the server. Never treat a client-side check
as a security boundary.

## Secure Randomness and Comparison
Use `crypto.getRandomValues()` / `crypto.randomUUID()` for tokens, nonces, and identifiers — never
`Math.random()`, which is not cryptographically secure. Compare secrets/HMACs with a constant-time
comparison, not `===`, when the comparison happens anywhere a timing signal could leak.

## Unsafe Deserialization and Storage
- Parse external data with `JSON.parse` into a validated shape; never feed untrusted input to
  `eval`-like reviver hacks.
- Do not persist tokens or PII in `localStorage`/`sessionStorage` when an XSS could read them;
  prefer short-lived in-memory tokens or secure, `HttpOnly` cookies set by the server.

## Dependencies
Client-side dependencies ship to users, so a vulnerable package is a direct attack surface. Run
`npm audit` and keep dependencies current (deep scan → the `ng-audit-deps` skill;
codebase-wide review → the `ng-security-auditor` agent).
