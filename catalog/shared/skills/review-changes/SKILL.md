---
id: shared/review-changes
kind: skill
name: review-changes
title: Review the Current Change
description: >-
  Review the current change with the reviewer agents this project has installed: the code reviewer
  of each changed language, and the security auditor when the change touches a risky area. It
  coordinates and reports; the agents review, and nothing is edited.
whenToUse: >-
  Run manually as `/review-changes` or `/review-changes <commit range, branch or paths>` before a
  commit or a push — e.g. "review my changes", "review this branch before I push", "run the pack
  reviewer on this diff". Not for explaining a diff to a reader (explain-diff), and not a review
  itself: with no reviewer agent installed it says so and stops.
argumentHint: "[commit range | branch | paths]"
disableModelInvocation: true
tags:
  - review
  - workflow
  - shared
---

# /review-changes: review the current change with the installed reviewers

Scope from the user: {sigil:arguments}

## Steps

1. **Find the change.** Use the scope above when one is given. Otherwise take the uncommitted
   changes; when the working tree is clean, take the commits this branch has that its base branch
   lacks. List the changed files. If nothing changed, say so and stop.
2. **Pick the reviewers.** Group the changed files by language. Each group goes to the installed
   code-reviewer agent of that language, named `<prefix>-code-reviewer` (`ts-`, `py-`, `cs-`,
   `react-`, `ng-`). A language with no installed reviewer goes to the `code-reviewer` agent when
   that one is installed. When no installed reviewer covers a group, name the files and the missing
   agent in the report: never hand them to a general-purpose reviewer, and never review them
   yourself in its place.
3. **Add the security auditor when the change calls for it.** Also start the installed
   `<prefix>-security-auditor` on the files that touch input parsing or validation, authentication
   or authorization, secrets or tokens, subprocess or shell calls, SQL or other query building,
   deserialization, file paths built from input, or outbound requests built from input.
4. **Run them.** Start each agent on its own files only, with the scope from step 1; start
   independent agents together. Pass on the scope and the file list and nothing else: each agent
   discovers the project's conventions itself.
5. **Report.** One list, highest severity first (Critical, High, Medium, Low). Each finding keeps
   its file and line and names the agent that found it; merge duplicates. Then two lines:
   **Not reviewed** (files no installed agent covered, and why) and **Agents used** (each agent and
   the files it was given). Make no edits.
