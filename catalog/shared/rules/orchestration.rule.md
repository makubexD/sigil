---
id: shared/orchestration
kind: rule
title: Orchestration and Delegation
description: >-
  How a lead session splits work with helper agents: the lead plans, decides and reviews, helpers
  take broad searches and mechanical work, every helper result is checked before it is accepted,
  effort is picked per task, and every hand-off prints a one-line report.
appliesTo:
  - "**/*"
appliesToRationale: >-
  Delegation governs how the session works, not any particular file, so a narrower glob would
  leave it unloaded exactly when work is being handed off.
tags: [workflow, delegation, shared]
---

- The main session plans, makes architecture decisions and reviews. Broad searches and independent
  or mechanical work go to helper agents.
- A helper's result is a claim, not a fact. Before accepting it, read the diff, rerun the tests and
  check that only the intended files changed.
- Pick the model by correctness first, then design quality, then cost. Keep judgment work (design,
  debugging, reviews, user-facing copy) on the strongest model. Send mechanical work that has a
  written spec to a cheaper one.
- Default to medium effort. Use low for mechanical work with a clear spec, high for debugging,
  design and reviews, and the maximum only for adversarial verification or a hard root cause. When
  output misses the bar, raise effort one step before switching models.
- Print one line before every hand-off: `⏵ <agent> (<model>, <effort> effort): <task in 10 words or
  fewer>`. For a fan-out, print one line per phase with the agent count.
- After two rejected attempts at the same task, do it in the main session.
