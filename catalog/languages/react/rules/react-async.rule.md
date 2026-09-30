---
id: react/react-async
kind: rule
title: Async (React)
description: React async data patterns — no raw fetch-in-useEffect, TanStack Query for server state, race conditions, Suspense
language: react
appliesTo:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/use*.ts"
  - "**/use*.js"
tags:
  - react
  - async
appliesToRationale: Scoped to components and hook files (use*.ts) because async data-fetching patterns are a React/hooks concern — "**/*.ts" also put this rule on plain TypeScript utilities (2026-09-27 live-prompt campaign).
---

## Never Fetch Raw in `useEffect`

A bare `fetch` call inside `useEffect` has no request deduplication, no caching, no retry, and a
classic race-condition bug when the effect re-runs before the prior request resolves:

```tsx
// Wrong — no cleanup guard; a fast component-id change can apply a stale response
useEffect(() => {
  fetch(`/api/users/${id}`).then(r => r.json()).then(setUser);
}, [id]);

// Correct — TanStack Query owns caching, dedup, retry, and race handling
const { data: user, isLoading } = useQuery({
  queryKey: ["user", id],
  queryFn: () => fetchUser(id),
});
```

Use TanStack Query (or SWR) for **server state** — anything fetched from an API. Reserve
`useState`/`useReducer` for **client state** — UI-local values with no server source of truth.

## Guard Against Stale Responses

If a raw effect-based fetch is unavoidable (a one-off, no query library available), guard against
out-of-order responses with a cleanup flag or `AbortController`:

```tsx
useEffect(() => {
  const controller = new AbortController();
  fetch(`/api/users/${id}`, { signal: controller.signal })
    .then(r => r.json())
    .then(setUser)
    .catch(err => { if (err.name !== "AbortError") throw err; });
  return () => controller.abort();
}, [id]);
```

Without this, rapid `id` changes can resolve out of order and apply a stale response after a newer
one — a real, hard-to-reproduce bug class in list/detail navigation UIs.

## Server Components: `await` Directly, No Client Hook Needed

In a Next.js App Router Server Component, `await` the data source directly — there is no
`useEffect`/`useQuery` involved because the component runs on the server, once, per request:

```tsx
// Server Component — no "use client", no hook
export default async function UserPage({ params }: { params: { id: string } }) {
  const user = await fetchUser(params.id);
  return <UserProfile user={user} />;
}
```

Reach for TanStack Query only inside a Client Component (`"use client"`) that needs client-side
refetching, mutations, or optimistic updates after the initial server-rendered data.

## Mutations

Use `useMutation` for writes (POST/PATCH/DELETE), and invalidate the affected query keys on
success rather than manually patching cached state, unless the mutation implements optimistic
updates deliberately:

```tsx
const queryClient = useQueryClient();
const { mutate } = useMutation({
  mutationFn: updateUser,
  onSuccess: (_, variables) => {
    queryClient.invalidateQueries({ queryKey: ["user", variables.id] });
  },
});
```

## `Suspense` Boundaries for Async UI

Wrap a component tree that reads data via a Suspense-integrated source (React Query's
`useSuspenseQuery`, RSC streaming) in a `<Suspense fallback={...}>` boundary close to where the
async data is actually needed — a single top-level boundary blocks the entire page on the slowest
fetch instead of streaming in progressively.

## No Unhandled Promise Rejections in Event Handlers

An `async` event handler (`onClick={async () => ...}`) whose promise rejects produces an unhandled
rejection with no user feedback. Wrap the body in `try`/`catch` and surface the error (toast, inline
message) — never let it fail silently:

```tsx
const handleSave = async () => {
  try {
    await saveUser(user);
  } catch (err) {
    toast.error("Failed to save — please try again");
  }
};
```

See `react-performance-profiler` (detects fetch-in-loop and waterfall patterns) and
`react-code-quality` (error-handling rules that also apply to async boundaries).
