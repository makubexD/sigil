# Friendlier "not found" errors

## Objective

When someone types an id that does not exist, the error should help them find the right one instead
of printing the whole catalog. A person with no prior knowledge should get a short "did you mean"
list and the command that lists everything.

## Evidence

- `node dist-cli/cli.js get no/such-id` prints `✗ Artifact 'no/such-id' not found. Available:` followed
  by every id in the catalog on one line (about 150 ids, over 5 KB). Observed while verifying the
  guided-menu work; it is the first thing a typo on `get`, `edit`, `patch` or `move` shows.
- Commander already gives "Did you mean …?" for mistyped commands (`sigil instal`); ids have no
  equivalent.
- `searchArtifacts` (`src/query/search.ts`, behind `sigil search`) already scores ids, titles and tags, so near matches can be
  computed without new infrastructure.

## Out of scope

- Changing exit codes or the `SigilError` shape (`src/errors.ts`).
- The guided menu's Search entry, which already exists.

## Success criteria

- A mistyped id on `get`, `edit`, `patch`, `move`, `retarget`, `delete` prints at most five close
  matches and the hint `Run sigil list or sigil search <word> to browse`.
- An id with the right name but the wrong language namespace suggests the namespace that has it.
- Unit tests cover a near miss, a wrong namespace, and no close match.
- `npm run ci:local` green (includes `sigil validate` and `sigil sync --check`)

## Riskiest assumption

That one shared helper (`requireArtifact`, `src/commands/shared/artifact.ts`) produces every
"not found" message; if some commands build their own, each needs the same change.

## Open questions

- Where is the cut-off for "close": edit distance, or reuse the search ranking threshold?
- Should `sigil add` selectors get the same treatment (`add skill:shared/gt`)?
