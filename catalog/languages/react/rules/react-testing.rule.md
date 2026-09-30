---
id: react/react-testing
kind: rule
title: Testing (React)
description: React Testing Library conventions — query by role/testid, user-event over fireEvent, mocking boundaries, coverage floor
language: react
appliesTo:
  - "**/*.test.tsx"
  - "**/*.spec.tsx"
  - "**/__tests__/**/*.tsx"
tags:
  - react
  - testing
appliesToRationale: Scoped to test files because these Testing Library conventions apply only to test code, not production component source.
---

## Query the Way a User Would

Prefer Testing Library's accessibility-first queries (`getByRole`, `getByLabelText`) over
`getByTestId`, and reserve `data-testid` for elements with no accessible role or label:

```tsx
// Correct — queries mirror how an assistive-tech user or a real user finds the element
render(<LoginForm />);
await userEvent.type(screen.getByLabelText("Email"), "ada@example.com");
await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

// Avoid — couples the test to an implementation detail, doesn't verify accessibility
await userEvent.click(screen.getByTestId("submit-btn"));
```

This ordering (`getByRole` > `getByLabelText` > `getByText` > `getByTestId`) is Testing Library's
own documented priority — following it means a passing test is also weak evidence the UI is
accessible.

## `user-event` Over `fireEvent`

Use `@testing-library/user-event` — it dispatches the full sequence of real browser events (focus,
keydown, keypress, input, keyup) that a single `fireEvent.change` skips, catching bugs a component
that relies on `onFocus`/`onKeyDown` would otherwise hide:

```tsx
// Correct — realistic event sequence
const user = userEvent.setup();
await user.type(screen.getByRole("textbox"), "hello");

// Avoid — synthetic, skips intermediate events
fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello" } });
```

## Test Behavior, Not Implementation

Assert on what the user sees or can do — rendered text, an element's presence/absence, a callback
firing — never on internal state, prop values passed to a child, or which hook was called. A test
that queries a component's internals breaks on every refactor even when behavior is unchanged.

## Mocking Boundaries

Mock the network boundary (an MSW handler intercepting the actual `fetch`/API call), not the
component's internal implementation. MSW (Mock Service Worker) is preferred over mocking a data
hook directly — it exercises the real request-building and response-parsing code, not just the
component's rendering given pre-shaped data:

```tsx
const server = setupServer(
  http.get("/api/users/:id", () => HttpResponse.json({ id: "u1", name: "Ada" })),
);
```

## Provider Wrapping

Wrap components that depend on context (a query client, a router, a theme provider) with a shared
`renderWithProviders` test helper rather than repeating the provider tree in every test file:

```tsx
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}
```

## Async Assertions

Use `findBy*` (returns a promise, retries until found) or `waitFor` for anything that appears after
an async update — never wrap an assertion in a bare `setTimeout` or add an arbitrary `await
new Promise(r => setTimeout(r, 100))` to "wait for the update":

```tsx
expect(await screen.findByText("Profile saved")).toBeInTheDocument();
```

## Coverage Floor

Discover the project's configured floor from the Vitest/Jest config (`coverage.thresholds`) — do
not assume a number. Run with `--coverage` to see which branches are untested before writing new
tests; target the actual gaps.

See `react-generate-tests` (creates a new test suite for untested components) and
`react-sync-tests` (reconciles drifted tests with changed components).
