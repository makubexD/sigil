# react-app

The customer portal: a Vite single-page app in React 19 and TypeScript. The API is on the same origin
under `/api` and authenticates with the session cookie.

- Data from the API is read with TanStack Query (`src/queryClient.ts`, `src/useProjects.ts`).
- Every API call goes through `request` in `src/http.ts`.
- Errors go to error tracking through `reportError` in `src/reporter.ts`.

This checkout has no `node_modules`: CI installs the dependencies and runs `npm run build` and
`npm test`.
