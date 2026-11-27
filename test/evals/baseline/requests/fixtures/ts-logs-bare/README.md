# ts-logs-bare

A small order-import library and its command-line tool. Node runs the TypeScript directly (no build
step, so no enums or parameter properties); `npm test` runs `node --test`. There are no runtime
dependencies. Services that use the library bring their own logger.
