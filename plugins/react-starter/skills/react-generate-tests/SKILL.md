---
name: react-generate-tests
description: "Use when adding or reviewing tests for React components. Covers React Testing Library, user-event, async queries, mocking, and accessibility assertions."
when_to_use: "Use when adding, updating, or reviewing tests for a React component — e.g. \"write tests for UserCard\", \"test this form submission\", \"check accessibility in this component's tests\". Covers React Testing Library queries, user-event interactions, async queries, mocking, and accessibility assertions."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "[component-file] (optional)"
---

# Generate Tests (React)

**Target:** $ARGUMENTS

## Step 1 — Resolve target

If `$ARGUMENTS` is provided, use it as the target component file. If empty, find components
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

Run the discovered test command for the new file. If a new test fails, decide whether the test or the code is wrong: fix a wrong test, but never weaken an assertion to make it pass; report a suspected bug instead. Then emit:

```
## Test Generation Report

Target: <component file>
Tests written to: <test file>
Runner: <discovered in Step 2>
Tests written: <N>
Result: ✅ <N> passed  /  ❌ <detail>
```

---

## Applied Rules

### Testing (React)

## Layout

Co-locate a test with its component (`UserCard/UserCard.tsx` + `UserCard/UserCard.test.tsx`)
unless the project already keeps tests in `__tests__/`; follow whichever the repo uses.

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

The full order is `getByRole` > `getByLabelText` > `getByPlaceholderText` (only when there is no
label) > `getByText` (non-interactive text) > `getByDisplayValue` > `getByAltText` > `getByTitle` >
`getByTestId`. This is Testing Library's own documented priority — following it means a passing
test is also weak evidence the UI is accessible.

Pick the variant by what the test expects:

| Variant | Not found | Several match | Waits |
|---|---|---|---|
| `getBy` / `getAllBy` | throws | `getBy` throws, `getAllBy` returns all | no |
| `queryBy` / `queryAllBy` | `null` / `[]` | `queryBy` throws, `queryAllBy` returns all | no |
| `findBy` / `findAllBy` | rejects after the timeout | `findBy` rejects, `findAllBy` returns all | yes |

Assert absence with `queryBy*` — `expect(screen.queryByText("Error")).not.toBeInTheDocument()` —
since `getBy*` throws before the assertion runs.

## Accessibility Assertions

Assert accessible state through roles and `jest-dom` matchers, not class names or internal flags:

```tsx
expect(screen.getByRole("alert")).toBeInTheDocument();
expect(screen.getByRole("checkbox")).toBeChecked();
expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
```

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

Keep shared handlers in one module (for example `src/mocks/handlers.ts`). When the dependency is a
plain function rather than a request, mock its module instead (`vi.mock` / `jest.mock`):

```tsx
vi.mock("../services/userService", () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1, name: "Ada" }),
}));
```

## Provider Wrapping

Wrap components that depend on context (a query client, a router, a theme provider) with a shared
`renderWithProviders` test helper (in a `test-utils` module) rather than repeating the provider tree
in every test file. Pass the tree as `render`'s `wrapper`, build a fresh client per render, and
turn off query retries so error states appear immediately:

```tsx
function AllProviders({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

export const renderWithProviders = (ui: React.ReactElement) =>
  render(ui, { wrapper: AllProviders });
```

## Async Assertions

Use `findBy*` (returns a promise, retries until found) or `waitFor` for anything that appears after
an async update — never wrap an assertion in a bare `setTimeout` or add an arbitrary `await
new Promise(r => setTimeout(r, 100))` to "wait for the update":

```tsx
expect(await screen.findByText("Profile saved")).toBeInTheDocument();
```

Prefer `findBy*` over `waitFor(() => getBy*(...))` — same behavior, shorter. `findBy*` waits up to
the library's default timeout (1 second); keep `waitFor` for conditions that are not a query.
Testing Library already wraps `render` and `user-event` in `act`, so a manual `act` is only for
updates triggered outside it.

## Coverage Floor

Discover the project's configured floor from the Vitest/Jest config (`coverage.thresholds`) — do
not assume a number. Run with `--coverage` to see which branches are untested before writing new
tests; target the actual gaps.

See `react-generate-tests` (creates a new test suite for untested components) and
`react-sync-tests` (reconciles drifted tests with changed components).
