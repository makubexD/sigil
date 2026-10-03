# Go (cobra)

Sources: [cobra user guide](https://github.com/spf13/cobra/blob/main/site/content/user_guide.md) ·
[command.go](https://github.com/spf13/cobra/blob/main/command.go) ·
[args.go](https://github.com/spf13/cobra/blob/main/args.go)

## Wiring the grammar

- One `*cobra.Command` per noun, `AddCommand` for its verbs. `Use: "deploy <version>"` is the
  usage line; `Short` feeds the parent's list; `Example` feeds help.
- Use `RunE` (returns an error), not `Run`, so failures reach one exit-code mapping in `main`.
- Positionals: `Args: cobra.ExactArgs(1)` (also `NoArgs`, `MinimumNArgs`, `MaximumNArgs`,
  `RangeArgs`, `OnlyValidArgs`, `MatchAll`). Validation failures are usage errors.
- Flags come from pflag: `--name value`, `--name=value`, `--` all work. Local flags on the
  command (`cmd.Flags()`), global ones as persistent flags on the root
  (`PersistentFlags()`). `MarkFlagsMutuallyExclusive` covers exclusive options.
- Suggestions for mistyped commands are on by default (`SuggestionsMinimumDistance`,
  `SuggestFor`, `DisableSuggestions`), but only at the root. **Pitfall:** a noun group with no
  `Run`/`RunE` accepts any argument, so `app users depoly` prints the group's help and
  `Execute` returns nil: exit 0, no suggestion (`legacyArgs` in args.go checks unknown
  subcommands only on the root; a runnable-less command returns `flag.ErrHelp` in
  command.go). Give every group `Args: cobra.NoArgs` and a `RunE` (help on stdout for no
  arguments), or a custom `Args` validator that reports the unknown verb with suggestions
  as a usage error.
- A `completion` command for bash, zsh, fish, and PowerShell is generated from the tree.

## Exit codes and streams: cobra's defaults need work

- `Execute()` returns an error; the exit code is whatever `main` does with it. Cobra does not
  separate usage errors from failures. Mark usage errors yourself: wrap flag errors with
  `SetFlagErrorFunc`, arg-validation errors in your `Args` functions, and unknown commands
  at the root (cobra returns an untyped error whose message starts `unknown command`; wrap
  it in `Args` validation rather than matching the text), then `os.Exit(2)` for those and
  `os.Exit(1)` for everything else. Use a typed usage error (`errors.As`) so `main` can tell
  the two apart.
- By default cobra prints the error and the full usage on every error, including
  operational ones. Set `SilenceUsage: true` (usage is noise after a real failure) and
  usually `SilenceErrors: true` on the root, then print `error: ...` yourself to stderr.
- Write payload through `cmd.OutOrStdout()` and diagnostics through `cmd.ErrOrStderr()`,
  never `fmt.Println`, so tests can capture both.

## Tests

In-process: build the root command fresh per test, `SetArgs([]string{...})`,
`SetOut(&stdout)`, `SetErr(&stderr)`, call `ExecuteC()` or `Execute()`, and assert on the
buffers and the error. Add a few real-process tests with `exec.Command` on the built binary
(`go build` in `TestMain`) to lock the actual exit codes.

## Packaging

`main.go` only calls `cmd.Execute()` and maps the result to `os.Exit`. Version via
`rootCmd.Version` (adds `--version`) set from `-ldflags "-X ..."` at build time. Its default
template prints `app version 1.4.0`; the grammar wants `app 1.4.0`, so call
`rootCmd.SetVersionTemplate("{{.Name}} {{.Version}}
")`.
