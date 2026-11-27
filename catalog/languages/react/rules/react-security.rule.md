---
id: react/react-security
kind: rule
title: Security (React)
description: React/browser security invariants — client-exposed secrets, third-party script integrity
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

- A variable prefixed `NEXT_PUBLIC_` or `VITE_` ships to the browser: no secret goes there, and a server-only
  secret is never passed into a `"use client"` component's props.
- A third-party script from a CDN carries `integrity` (SRI), and a component that injects a `<script>` is checked
  against the Content-Security-Policy.
