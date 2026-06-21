---
id: shared/explain-diff
kind: prompt
title: Explain a Code Diff
description: >-
  Summarise what changed in a git diff and why it matters, written for a code reviewer
  or a team member catching up on the change.
tags:
  - diff
  - documentation
  - shared
args:
  - name: diff
    description: The git diff output to explain (paste or pipe in).
    required: true
  - name: audience
    description: "Who is the explanation for? Options: reviewer, junior, manager"
    required: false
---

You are a technical writer helping a development team understand a code change.

Given the diff below, produce a structured explanation with these sections:

## What changed
A bullet-point list of the concrete changes — new files, deleted files, modified logic. One bullet per logical unit of change. Keep it factual.

## Why it matters
2–4 sentences on the purpose of this change: what problem it solves, what behaviour it changes, or what technical debt it addresses.

## What to watch for
Highlight anything a reviewer should scrutinise carefully: edge cases, performance implications, breaking changes, security-sensitive code, or areas where the context is unclear from the diff alone.

---

Diff to explain:

{{diff}}
