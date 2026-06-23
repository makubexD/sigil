# Troubleshooting & FAQ

---

## `npm run build` runs out of memory (heap OOM)

`npm run build` already sets `NODE_OPTIONS=--max-old-space-size=8192` via `cross-env`. If you
invoke `tsc` directly (e.g. in `build:watch`), prefix it yourself:

```bash
NODE_OPTIONS=--max-old-space-size=8192 tsc -p tsconfig.build.json --watch
```

---

## `sigil add` hangs without output (CI / piped context)

The wizard requires an interactive TTY. In CI or any non-interactive context, always pass a
selector and `--yes`:

```bash
sigil add all --yes
sigil add skill:csharp/xunit-testing --yes
```

---

## `sigil add` says "N conflict(s) — no files overwritten"

Existing files are never overwritten by default. Use `--overwrite` to replace them, or `--dry-run`
to preview what would change:

```bash
sigil add skill:csharp/xunit-testing --dry-run --yes   # preview only
sigil add skill:csharp/xunit-testing --overwrite --yes  # replace
```

---

## `sigil validate` reports schema violations

Run `sigil check <file>` for a per-file explanation of each violation. Common violations:

| Violation | Fix |
| --------- | --- |
| `Schema: missing required field 'title'` | Add `title:` to the artifact frontmatter |
| `id/path mismatch` | Ensure `id:` matches `<language>/<name>` or `shared/<name>` |
| `platforms: unknown value 'openai'` | Use only `claude` or `copilot` in the platforms list |
| `uses.rules references unknown artifact` | Check the rule ID in `uses.rules` — must match an existing catalog entry |
| `Dependency coverage drift` | A `uses:` dep targets fewer platforms than the referencing skill — widen the dep's `platforms:` or narrow the skill's |

For a full description of each schema field → [spec.md](spec.md).

---

## Tests fail after editing a test file

`test/` is excluded from the main tsconfig. Recompile the test file separately before running:

```bash
npx tsc --outDir test test/pipeline.test.ts --module commonjs --target ES2020 --esModuleInterop --skipLibCheck
npm test
```

---

## `sigil release` fails at the verify gate

The gate runs `npm run build`, `npm run validate`, `npm test`, and `npm run catalog:build`. If any
step fails, the version bump is already written but **not committed** — fix the failing step, then
either:

- Re-run `sigil release <explicit-version>` (use an explicit `x.y.z` to avoid double-bumping), or
- Restore and start fresh:

```bash
git checkout package.json package-lock.json
# fix the root cause, then re-run
sigil release patch
```
