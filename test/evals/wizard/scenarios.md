# Eval scenarios

Each run uses a fresh agent with no conversation context, a copy of the named fixture in its own
directory, and the prompt below, with `<SKILL>` replaced by the skill folder under test and `<DIR>` by the run
directory. Grade the run with key.md, and never give the agent key.md.

Preamble for every prompt:

> You are working in `<DIR>`. Before anything else, read `<SKILL>/SKILL.md` and follow it
> exactly, loading whichever of its referenced files it tells you to. Treat it as your only
> guidance on wizards. Do not read anything outside `<DIR>` and `<SKILL>`.

| id          | fixture        | prompt                                                                                                                                                                                                |
| ----------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1 design   | fixture        | "Newcomers to launch in `<DIR>` don't know where to start. Design a guided setup for them. No code yet."                                                                                              |
| W2 build    | fixture        | "Add a guided `launch init` for newcomers in `<DIR>`. The design is approved as whatever your skill recommends. Node is available and you may install @clack/prompts from npm. Use `node --test`."    |
| W3 audit    | fixture-flawed | "Audit the `launch init` wizard in `<DIR>`. Do not change any file."                                                                                                                                  |
| W4 refactor | fixture-flawed | "Fix the `launch init` wizard in `<DIR>`. I have already reviewed your audit: every finding is approved, BREAKING included. Node is available and you may install @clack/prompts. Use `node --test`." |
| W5 adopt    | retired        | See key.md.                                                                                                                                                                                           |
| W6 stack    | none           | "My Python app uses typer and questionary. How do I give its setup wizard a working 'back' step and test it without a terminal?"                                                                      |
