---
id: react/react-generate-tests
kind: skill
name: react-generate-tests
title: Write React Component Tests
description: Use when adding or reviewing tests for React components. Covers React Testing Library, user-event, async queries, mocking, and accessibility assertions.
language: react
uses:
  rules:
    - react/react-conventions
  agents:
    - react/react-code-reviewer
tags:
  - react
  - testing
  - rtl
  - vitest
  - jest
whenToUse: "Use when adding, updating, or reviewing tests for a React component — e.g. \"write tests for UserCard\", \"test this form submission\", \"check accessibility in this component's tests\". Covers React Testing Library queries, user-event interactions, async queries, mocking, and accessibility assertions."
allowedTools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
argumentHint: "[component-file] (optional)"
---

# Generate Tests (React)

**Target:** {sigil:arguments}

## Step 1 — Resolve target

If `{sigil:arguments}` is provided, use it as the target component file. If empty, find components
with no matching `*.test.tsx` (or `__tests__/`) file; present the top candidates and ask the user to
choose before proceeding.

## Step 2 — Discover the runner and layout

Read what the project uses rather than assuming: `package.json` `scripts.test` and
`devDependencies` (Vitest or Jest, `@testing-library/react`, `@testing-library/user-event`), the
runner's config and setup file, and 2–3 existing component tests for layout and query style.

## Step 3 — Read the target

Identify the component's props, user interactions, async effects and data fetching (the mock
boundaries), and the states to cover: loading, empty, error and success, plus accessibility.

## Step 4 — Write tests

Follow [the project's component-testing conventions](references/testing-conventions.md): what to
test, file layout, querying the DOM (see [the query reference](references/testing-library.md)), user
interactions, async queries, mocking API calls, accessibility assertions and provider wrapping.
Create the containing directory if it does not exist.

## Step 5 — Run and report

Run the discovered test command for the new file. Fix any failures before finishing. Then emit:

```
## Test Generation Report

Target: <component file>
Tests written to: <test file>
Runner: <discovered in Step 2>
Tests written: <N>
Result: ✅ <N> passed  /  ❌ <detail>
```
