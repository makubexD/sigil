# Hooks (and settings) for GitHub Copilot

## Objective

Teach the Copilot target to emit the catalog's `hook` artifacts as Copilot hook files so
guard-rails such as `shared/protect-config` work on both providers. Installed with
`sigil add --target copilot`; output is a JSON file under `.github/hooks/` (path and schema to
verify), merged and uninstalled with the existing config-kind machinery. `settings` stays
Claude-only unless a Copilot equivalent is found.

## Evidence

- `src/targets/copilot/capabilities.ts:10,22-23` sets `hook` and `settings` to `mode: 'none'`
  with reason "Claude Code's own vocabulary"; `docs/reference/capabilities.md` shows `hook` and
  `settings` as `— (1)` for copilot scaffold.
- Hook frontmatter is Claude's vocabulary: `KIND_REGISTRY` has `ownedBy: ['claude']` at
  `src/kinds.ts:89` and `:101` (hook and settings); validate warns on `ownedBy`-nonempty kinds
  (`src/kinds.ts:51`).
- Config kinds merge into user-owned JSON and must call `ensureHomeBackup` from every writer
  (CLAUDE.md invariants; `src/commands/add/execute-config.ts`).
- Web, to verify: [About hooks](https://docs.github.com/en/copilot/concepts/agents/hooks) (search
  result) describes JSON files in `.github/hooks/*.json`, six events (`sessionStart`,
  `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `errorOccurred`) on the cloud
  agent and Copilot CLI, and a VS Code preview. Event names and the file schema differ from
  Claude's; none of it was confirmed against current docs here.

## Out of scope

- A Copilot plugin carrying hooks ([copilot-plugin-channel](copilot-plugin-channel.md)).
- Copilot `settings` equivalents.
- Porting hook scripts' logic; the hook command must already be portable.

## Success criteria

- Source-of-truth decision: provider-neutral hook schema vs a `copilot:` namespace on hook
  artifacts, recorded in `docs/decisions/`.
- `add --target copilot` for `shared/protect-config` writes a valid hook file; `uninstall` and
  `update` reverse and replace it (`replaceMerge`).
- A live probe (like the ADR section 7 campaign) shows the hook blocks on Copilot CLI.
- Capability table row changed to `native`, `docs/reference/capabilities.md` regenerated, and a
  `KindEmitSpec`/citation present so `provider-kind-coverage` passes.
- `npm run ci:local` green (includes `sigil validate` and `sigil sync --check`)

## Riskiest assumption

That a Claude hook's matcher and stdin/stdout contract maps onto Copilot's `preToolUse`; the
exit-code blocking behaviour is the part most likely to differ.

## Open questions

- Does Copilot CLI read hooks from `.github/hooks` only in the working directory, and does the
  cloud agent require them on the default branch (to verify at the URL above)?
- Does VS Code ignore matchers (as the ADR matrix notes)?
- How are cross-platform commands (PowerShell vs sh) expressed?
