# Scaffold templates

Worked examples for Step 3/4 of `ts-scaffold-project`. `<runner>` below is whatever Step 1
discovered (the workspace's existing test runner, or `node:test` if there is no prior convention
to follow) — never assume Vitest specifically.

## `package.json`

```json
{
  "name": "<name>",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "<discovered test command>"
  }
}
```

Adjust for `--type=app` (no `exports`/`files`; may add a `"bin"` entry for `--type=cli`). If CPM /
shared versions are in use, omit version numbers from `devDependencies` — inherit from root. Add
the discovered runner to `devDependencies` only if it isn't already a root/shared dependency.

## `tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

## `src/index.ts`

```typescript
/**
 * <name> — <one-line description>.
 *
 * @module
 */

/**
 * Entry point for the <name> package.
 *
 * @param input - TODO: describe parameter.
 * @returns TODO: describe return value.
 */
export function main(input: string): string {
  // TODO: implement
  return input;
}
```

## `src/cli.ts` (only for `--type=cli`)

```typescript
#!/usr/bin/env node
/**
 * CLI entry point for <name>.
 */

const [, , ...args] = process.argv;
// TODO: wire argument parsing and call main()
process.exit(0);
```

## `test/index.test.ts` (unless `--type=test`)

Example shown with Vitest — use whatever `<runner>` Step 1 discovered instead:

```typescript
import { describe, it, expect } from "vitest";
import { main } from "../src/index.js";

describe("main", () => {
  it("should return the input unchanged as a placeholder", () => {
    // Arrange
    const input = "hello";

    // Act
    const result = main(input);

    // Assert
    expect(result).toBe(input);
  });
});
```

With `node:test` instead, the equivalent is `import { describe, it } from "node:test"` plus
`import assert from "node:assert/strict"`, and `expect(result).toBe(input)` becomes
`assert.equal(result, input)`.
