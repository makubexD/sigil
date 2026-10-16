---
id: shared/clean-code
kind: rule
title: Clean Code Baseline
description: Universal readability and quality rules applied across every language and file type.
appliesTo:
  - "**/*"
appliesToRationale: >-
  The rule is language-agnostic by design, so any narrower glob would exclude a language
  this rule is meant to cover.
tags:
  - quality
  - baseline
  - shared
---

- **Clear names over comments.** Name variables, functions, and types to reveal their intent. A comment that re-states the code name is noise; a comment that explains *why* is valuable. A name states the domain role (`retryDelay`, not `value`), a boolean reads as a predicate (`isExpired`), and a quantity carries its unit (`timeoutMs`).
- **No dead code.** Delete commented-out code; use version control to recover it if needed. Dead code obscures the live logic.
- **Avoid magic numbers and strings.** Replace bare literals with named constants or enums so the meaning is clear at the call site.
- **Handle errors explicitly.** Never silently swallow exceptions or return null to signal an error. Make failure visible and actionable.
- **Duplicated knowledge, not duplicated text.** A wrong abstraction costs more than duplication. Tolerate a second copy of similar code; extract on the third, and only when the copies change for the same reason. Duplicated *knowledge* (a business rule, a constant, a schema) is a bug at the second copy: give it one home.
- **Fail fast.** Validate inputs at the boundary (function entry, API surface, config load). Do not let invalid state propagate deep into the system.
- **Consistent formatting.** Use the project's formatter/linter. Never debate formatting in code review — automate it.
- **Legacy code is not a precedent.** New or changed code follows these rules even when the code around it does not. Never copy an existing violation for consistency. If a rule needs something the project lacks, such as logging or configuration, say so in your summary instead of adding infrastructure the task did not ask for.
- **Mark known shortcuts.** When you knowingly leave a simplification or an unhandled case, mark it with a `shortcut:` comment saying what and why, and name it in your summary.
