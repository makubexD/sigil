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
    - shared/code-reviewer
tags:
  - react
  - testing
  - rtl
  - vitest
  - jest
whenToUse: "Use when adding, updating, or reviewing tests for a React component — e.g. \"write tests for UserCard\", \"test this form submission\", \"check accessibility in this component's tests\". Covers React Testing Library queries, user-event interactions, async queries, mocking, and accessibility assertions."
---# Writing React Component Tests

When asked to add, update, or review component tests, follow these conventions.
These patterns apply whether you use Vitest or Jest — the Testing Library API is identical.

## What to Test

Test **behaviour and accessibility**, not implementation details: "clicking Submit calls `onSave`
with the form values" and "an error message appears when the input is blank" are good tests; "the
internal `isLoading` state is `true`" and "the `handleClick` handler is called" are not — they test
implementation, not observable behavior.

## File Layout and Basic Structure

Co-locate a test with its component (`UserCard/UserCard.tsx` + `UserCard/UserCard.test.tsx`):

```tsx
import { render, screen } from '@testing-library/react';
import { UserCard } from './UserCard';

describe('UserCard', () => {
  it('renders the user name and email', () => {
    render(<UserCard name="Alice" email="alice@example.com" />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });
});
```

## Querying the DOM

Prefer queries in this priority order (most accessible first):

```tsx
screen.getByRole('button', { name: /submit/i })   // ✅ best: uses ARIA role
screen.getByLabelText('Email address')             // ✅ form fields
screen.getByPlaceholderText('Enter email')         // ⚠️  only if no label
screen.getByText('Submit')                         // ⚠️  for non-interactive text
screen.getByTestId('submit-button')                // 🔴 last resort
```

See `references/testing-library.md` for the full query reference.

## User Interactions

Always use `userEvent` (not `fireEvent`) — it simulates real browser behaviour:

```tsx
it('calls onSave with entered name when form is submitted', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();     // or jest.fn()
  render(<UserForm onSave={onSave} />);

  await user.type(screen.getByLabelText('Name'), 'Bob');
  await user.click(screen.getByRole('button', { name: /save/i }));

  expect(onSave).toHaveBeenCalledWith({ name: 'Bob' });
});
```

## Async Queries

Use `findBy*` for elements that appear asynchronously (after a fetch, delay, or state update):

```tsx
it('shows the user list after loading', async () => {
  render(<UserList />);

  expect(screen.getByText(/loading/i)).toBeInTheDocument();

  const items = await screen.findAllByRole('listitem');  // waits up to 1 second
  expect(items).toHaveLength(3);
});
```

## Mocking API Calls

Use `msw` (Mock Service Worker) for network mocking: `http.get('/api/users', () =>
HttpResponse.json([{ id: 1, name: 'Alice' }]))` in `src/mocks/handlers.ts`. For simple function
mocks, mock the module directly:
```tsx
vi.mock('../services/userService', () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1, name: 'Alice' }),
}));
```

## Accessibility Assertions

```tsx
expect(screen.getByRole('alert')).toBeInTheDocument();
expect(screen.getByRole('checkbox')).toBeChecked();
expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
```

## Wrapping with Providers

If the component needs context (Router, Query, Theme), wrap once in a custom `render`:

```tsx
// test-utils.tsx
function AllProviders({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}

export const renderWithProviders = (ui: React.ReactElement) => render(ui, { wrapper: AllProviders });
```
