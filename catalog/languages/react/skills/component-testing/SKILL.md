---
id: react/component-testing
kind: skill
name: component-testing
title: Write React Component Tests
description: >-
  Use when adding or reviewing tests for React components. Covers React Testing Library,
  user-event, async queries, mocking, and accessibility assertions.
language: react
appliesTo:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.test.tsx"
  - "**/*.test.jsx"
uses:
  rules:
    - react/react-style
  agents:
    - shared/code-reviewer
tags:
  - react
  - testing
  - rtl
  - vitest
  - jest
---

# Writing React Component Tests

When asked to add, update, or review component tests, follow these conventions.
These patterns apply whether you use Vitest or Jest — the Testing Library API is identical.

## What to Test

Test **behaviour and accessibility**, not implementation details:
- ✅ "When the user clicks Submit, the `onSave` callback is called with form values."
- ✅ "An error message appears when the input is blank."
- ❌ "The component's internal `isLoading` state is `true`."
- ❌ "The `handleClick` handler is called."

## File Layout

```
src/
  components/
    UserCard/
      UserCard.tsx
      UserCard.test.tsx   # co-located, same directory
```

## Basic Structure

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

Use `msw` (Mock Service Worker) for network mocking in Vitest/Jest:

```tsx
// src/mocks/handlers.ts
import { http, HttpResponse } from 'msw';
export const handlers = [
  http.get('/api/users', () =>
    HttpResponse.json([{ id: 1, name: 'Alice' }]),
  ),
];
```

For simple function mocks:
```tsx
vi.mock('../services/userService', () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1, name: 'Alice' }),
}));
```

## Accessibility Assertions

```tsx
// Checks that an element is accessible to screen readers
expect(screen.getByRole('alert')).toBeInTheDocument();
expect(screen.getByRole('button', { name: /delete/i })).not.toBeDisabled();

// Check aria attributes
expect(screen.getByRole('checkbox')).toBeChecked();
expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
```

## Wrapping with Providers

If the component needs context (Router, Query, Theme), wrap once in a custom `render`:

```tsx
// test-utils.tsx
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
