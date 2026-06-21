---
id: shared/clean-code
kind: rule
title: Clean Code Baseline
description: >-
  Universal readability and quality rules applied across every language and file type.
appliesTo:
  - "**/*"
severity: recommended
extends: []
tags:
  - quality
  - baseline
  - shared
---

- **Clear names over comments.** Name variables, functions, and types to reveal their intent. A comment that re-states the code name is noise; a comment that explains *why* is valuable.
- **Small, single-purpose functions.** A function should do one thing. If you need to scroll to see the end of a function, it is too long.
- **No dead code.** Delete commented-out code; use version control to recover it if needed. Dead code obscures the live logic.
- **Avoid magic numbers and strings.** Replace bare literals with named constants or enums so the meaning is clear at the call site.
- **Handle errors explicitly.** Never silently swallow exceptions or return null to signal an error. Make failure visible and actionable.
- **Keep it DRY but not over-abstracted.** Duplication is worse than a bad abstraction; over-abstraction is worse than mild duplication. Extract when you have three concrete examples of the same pattern.
- **Fail fast.** Validate inputs at the boundary (function entry, API surface, config load). Do not let invalid state propagate deep into the system.
- **Consistent formatting.** Use the project's formatter/linter. Never debate formatting in code review — automate it.
