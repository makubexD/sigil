# Plan: Codex target, Phase D (config format seam)

Roadmap: [plan-codex-target](plan-codex-target.md). Behavior-preserving: `test/fixtures/output-snapshot/` must not change.

## Step 1 `[worker:high]`: one format module

Files: new `src/config-merge/file-format.ts`, `src/config-merge/index.ts`, `src/commands/add/execute-config.ts`,
`src/commands/update-config-io.ts`, `src/commands/uninstall-config.ts`, `src/manifest/status-config-check.ts`,
`src/config-utils.ts`, new `test/config-merge/file-format.test.ts`.

```ts
/** Parses a config file's text by its path; throws on invalid content. */
export function parseConfig(fullPath: string, text: string): Record<string, unknown>;
/** The text to write for `merged`. `before` is the file's current text, unused by JSON. */
export function renderConfig(
  fullPath: string,
  merged: Record<string, unknown>,
  before?: string,
): string;
```

Today both are JSON only: `JSON.parse` and `serialize(merged)`. Each `.ts` file above replaces its `JSON.parse` of a config
file with `parseConfig`, and its `fs.writeFileSync(fullPath, serialize(x), 'utf-8')` with `renderConfig`. `serialize` stays
JSON's only disk writer, and is now called only from `file-format.ts`. Don't touch `canonicalize`. Messages stay the same,
including "not valid JSON". `src/commands/uninstall-config.ts` keeps its emptied-file deletion.

Test cases:

| Case                                     | Expected                                      |
| ---------------------------------------- | --------------------------------------------- |
| `parseConfig('a.json', '{"a":1}')`       | `{ a: 1 }`                                    |
| `parseConfig('a.json', 'nope')`          | throws                                        |
| `renderConfig('a.json', { b: 1, a: 2 })` | equals `serialize`, key order kept            |
| `git grep "serialize(" src/commands`     | no call site left (a test reading the source) |

Test: `npm test`, with no snapshot change, then `npm run build` and `git status` showing no generated change.
