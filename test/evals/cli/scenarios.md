# Eval scenarios

Each run: a fresh agent with no conversation context, a copy of the fixture in its own directory,
and this prompt with `<SKILL>` = the skill folder under test and `<DIR>` = the run directory.
Grade with key.md. Never give the agent key.md.

Preamble for every prompt:

> You are working in `<DIR>`. Before anything else, read `<SKILL>/SKILL.md` and follow it
> exactly, loading whichever of its referenced files it tells you to. Treat it as your only
> guidance on CLI design. Do not read anything outside `<DIR>` and `<SKILL>`.

- **S1 audit:** "Audit the CLI in `<DIR>` (shipit). Do not change any file."
- **S2 design:** "Design the command grammar for a new CLI `notes` that creates, edits, lists,
  tags, deletes notes and syncs them with a remote. No code yet."
- **S3 refactor:** "Refactor shipit in `<DIR>` to a clean grammar. I have already reviewed your
  audit: every finding is approved, BREAKING included. Keep old syntax working with a
  deprecation path. Node 22 is available; use `node --test`."
- **S4 build:** "Build a new CLI `todo` in `<DIR>` with Node 22 and zero dependencies: add, list,
  complete and remove tasks, and list tags. Include tests (`node --test`)."
  The skill stops for grammar approval first (build step 1): approve the proposed grammar,
  then grade the build.
- **S5 stack:** "This project uses Python click. How do I make usage errors and operational
  failures follow the right exit codes, keep errors on stderr, and test that?"
- **S7 narrow:** "In `<DIR>`, rename `shipit users show-all` to `shipit users list`.
  Node 22 is available; use `node --test`."
- **S6 adopt:** retired (see key.md).
