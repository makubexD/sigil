# ng-app

The back office: an Angular 22 app with standalone components, signals and no zone.js. The API is on
the same origin under `/api`.

- HTTP goes through `HttpClient`; `authInterceptor` adds the access token that `AuthService` holds.
- Diagnostics go through `LoggerService` (`src/app/logger.service.ts`), which ships them to the log
  collector.

This checkout has no `node_modules`: CI installs the dependencies and runs `ng build` and `ng test`.
