---
id: react/react-generate-tests
kind: skill
name: react-generate-tests
title: "Generate Tests (React)"
description: Use when adding or reviewing tests for React components. Covers React Testing Library, user-event, async queries, mocking, and accessibility assertions.
language: react
uses:
  rules:
    - react/react-testing
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

Follow the conventions in `react-testing` (layout, query priority and variants, `user-event`,
async queries, mocking boundaries, accessibility assertions, provider wrapping), adapted to what
Step 2 found. Create the containing directory if it does not exist.

- Write one test per user-visible behavior from Step 3: each interaction, and each of the loading,
  empty, error and success states. Assert what the user sees, never internal state or handlers.
- Render through the project's `renderWithProviders` when the component needs context; add one to
  the test utilities only if none exists.

```tsx
// Example shown with Vitest — use jest.fn() / jest.mock under Jest (Step 2 determines this).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserForm, UserList } from "./Users";

describe("Users", () => {
  it("calls onSave with the entered name when the form is submitted", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<UserForm onSave={onSave} />);

    await user.type(screen.getByLabelText("Name"), "Bob");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith({ name: "Bob" });
  });

  it("shows the loading state, then the list", async () => {
    render(<UserList />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(await screen.findAllByRole("listitem")).toHaveLength(3);
  });
});
```

### Cheat-sheet

- **Roles:** `button`, `link`, `textbox` (input, textarea), `checkbox`, `combobox` (select, custom
  dropdown), `listitem`, `heading` (`{ level: 2 }`), `alert` (error messages), `dialog`, `img`
  (`{ name: <alt text> }`).
- **`jest-dom` matchers:** `toBeInTheDocument`, `toBeVisible`, `toBeDisabled`, `toBeChecked`,
  `toHaveValue`, `toHaveTextContent`, `toHaveAttribute`, `toHaveClass`, `toHaveFocus` (each with
  `.not`).
- **`user-event` actions** (after `const user = userEvent.setup()`): `click`, `type`, `clear`,
  `selectOptions`, `keyboard("{Enter}")`, `hover`, `tab` (moves focus to the next focusable
  element) — all awaited.

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
