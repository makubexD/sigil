# Plan: a README that shows what Sigil is

The README is out of date and hard to read. Its status line says v0.1 with three targets, but Sigil has seven, a published
marketplace and a real install flow. At 286 lines it holds per-target detail that belongs in the setup guides, and the point of the
project is lost in it.

Goal: on a new machine or a first visit, you understand Sigil in a minute and can install it from the page.

## Limits

- **GitHub strips CSS and scripts.** "Fancy" here means the logo, badges, a Mermaid diagram, clean tables and `<details>` blocks.
- **Facts come from the repo.** Targets come from `docs/reference/capabilities.md`, and commands are run, not recalled. Nothing
  claims a route that isn't proven, so `npm install -g sigil` stays out, and unproven items stay marked as such.
- **No exact catalog counts by hand.** They go stale, as the v0.1 line did. Round them ("about 45 skills") and link the generated
  artifact index.
- **Nothing is lost.** Detail that leaves the README must already exist in a linked guide, or move there first.

## Step 1: Rewrite the README `[inline: user-facing copy]`

Files: `README.md`, `docs/guides/consuming.md` (only if a moved detail isn't there yet), `CHANGELOG.md`.

Sections, in order:

1. **Hero:** the logo, a one-line pitch, and badges for CI, latest release, license and Node version. Links to Install, Quick
   start and the docs.
2. **Why:** the problem in two or three lines, then a Mermaid diagram of the real pipeline: catalog, load, validate, resolve, then
   each target's output.
3. **What you get:** a short list of what makes it more than a copy tool, each proven in the repo: one neutral catalog, safe
   updates that detect your edits, config merged into your files and never overwritten, the trust scanner, and a Claude marketplace.
4. **Install:** clone, build and `npm link` first, then the Claude marketplace route. Say plainly that it isn't on npm yet.
5. **Quick start:** the guided `sigil` menu, then four or five commands. The rest of today's 137 lines goes to the consuming guide.
6. **The catalog:** a table by kind with rounded counts and a line on what it holds, a table of the packs, and links to the artifact
   index.
7. **Targets:** one table, a row per target, showing what each receives and linking its setup guide. Claude and Copilot come first.
   The long per-target bullets are replaced by this table and notes on real limits.
8. **Who are you?**, kept as it is. **Library usage**, inside `<details>`. **Learn more** and **License**.

Add a CHANGELOG line. Aim for under 180 lines.

Test: `npm run format:check`, then `npm run build && npm run build:test && node --test test-compiled/**/*.test.js` only if a test
reads `README.md` (`grep -rl README test/*.ts` finds them).

## Step 2: Check it for real `[inline: judging the rendered page]`

Files: `README.md`.

| Check                                                        | Expected                                     |
| ------------------------------------------------------------ | -------------------------------------------- |
| Each command in Install and Quick start, in an empty folder  | Runs as written                              |
| Each relative link and anchor                                | Resolves to a real file and heading          |
| Each badge URL                                               | Returns an image, for a workflow that exists |
| Each target row against `docs/reference/capabilities.md`     | Agrees                                       |
| Rounded counts against `sigil list`                          | Within a few of the real number              |
| Stale words: `v0.1`, `Three targets`                         | Gone                                         |
| The page on github.com, on the pushed branch, light and dark | Logo, diagram and tables render              |

Test: the table above, then `npm run ci:local`.
