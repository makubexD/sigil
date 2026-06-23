## Summary

<!-- One sentence: what artifact(s) does this PR add or change, and why? -->

**Kind:** <!-- skill / agent / rule / prompt -->
**ID(s):** <!-- e.g. csharp/ef-core-migrations -->
**Language:** <!-- e.g. csharp, python, react — or "shared" -->
**Platforms:** <!-- all (DRY default) — or list the restriction and the reason -->

---

## Pre-submit checklist

- [ ] `sigil check <file>` — 0 violations
- [ ] `npm run validate` — 0 errors
- [ ] `npm run catalog:build` — builds cleanly; inspected `dist/claude/` and `dist/copilot/` output
- [ ] Body is written in neutral language — no "For Claude only:" or "For Copilot:" sections
- [ ] `extends:` / `uses:` used instead of copying existing rule or agent text (DRY)
- [ ] `id:` matches the file path convention (`<language>/<name>` or `shared/<name>`)
- [ ] `platforms:` is intentional — omitted (= DRY propagate to all AIs) **or** restriction is justified above
- [ ] PR branch follows the naming convention: `artifact/<kind>-<name>`
- [ ] No generated files (`dist/`, `dist-cli/`) included in this PR

---

## Testing notes

<!-- Describe how you tested this: which AI tool you installed it into, what you invoked, what the output looked like. Screenshots or transcript excerpts welcome. -->
