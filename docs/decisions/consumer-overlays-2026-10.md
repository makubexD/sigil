# Consumer overlays (2026-10)

Status: spike done, go for v1 (see Spike result). Owner put overlays in scope for the 2026-10-14 benchmark
(docs/audits/2026-10-14); this records the design and the decision gate, not shipped code.

## The need

A project wants to narrow what sigil installs without forking the catalog: scope a rule to its own
folders, name its test command, pin its log library. Today the only options are editing the
installed file (which `status` then reports as `drifted` and `update` will not touch without
`--force`) or keeping a separate instruction file next to it (which works, but nothing ties it to
the artifact it adjusts, so it silently goes stale when the artifact changes).

dotnet/skills pilots overlays for three skills (`plugins/dotnet-test/OVERLAYS.md`): an optional
file in the consumer repo, bound to the skill by id and a revision, read by the skill at run time,
allowed to narrow defaults but never to widen permissions or scope. Its precedence is user
instructions > verified project constraints > overlay > skill defaults.

## Model

- **An overlay is consumer data, applied at write time.** It lives in the consumer project
  (`.sigil/overlays/<artifact-id>.yaml`), never in the catalog and never read through `PKG_ROOT`.
  The 4-stage pipeline (load, validate, resolve, target) does not learn about it: the target's
  `FileMap` is produced as today, and the overlay is applied to that file's content just before
  `writeFilesSync`, by `add` and `update` only.
- **It may narrow, never widen.** v1 supports exactly one operation: narrowing a rule's path scope
  (`paths:` for Claude, `applyTo:` for Copilot). An overlay glob must match a subset of what the
  catalog glob matches; anything else is rejected at `add`/`update` with the reason. No body edits,
  no tool or permission changes.
- **It is recorded like a config fragment.** The manifest entry gains `overlay: { sha256, ops }`,
  the same partial-ownership idea as `ManifestConfigMerge`: sigil knows what it applied, so it can
  re-apply it after rendering a new catalog version (replace-then-apply, as `replaceMerge` does for
  config fragments) and reverse it on `uninstall`.
- **Drift is measured after the overlay.** The recorded file hash is the hash of the overlaid
  content, so an overlaid file is `intact`, and a user edit on top of it is still `modified`.
- **Binding.** The overlay names the artifact id and the template revision (when templated) it was
  written against; a mismatch after `update` is reported (`status`: `overlay stale`), and the
  overlay is still applied only if its op is still valid against the new catalog globs.

## Cost

Touches `add`, `update`, `uninstall`, `prune` and `status`, the manifest schema (additive field), and
both targets' rule emitters (only through the shared write path, not their specs). It adds a
consumer-side file format with its own validation, documentation and error messages, maintained by
one person.

## Dissent

The CTO role in the panel voted to kill overlays: no consumer has asked for them, consumers can
already add their own instruction files, and the change touches every installer command. The
decision below keeps the spike small enough that this risk is measured, not assumed.

## Decision gate (spike)

One day, one branch (`spike/overlay-claude-rule-paths`), never merged. Claude scaffold only, rule
kind only, path narrowing only. It must answer:

1. Can "overlay globs match a subset of catalog globs" be checked reliably without enumerating the
   file system? (If not, v1 is not safe and overlays are dropped.)
2. How many lines does it add to `add`/`update`/`uninstall`/`status`, and does any of the four
   invariants (path anchoring, config-merge serialization, drift classification, partition
   conflicts) need an exception?
3. Does `update` re-apply the overlay cleanly across a catalog change to the same rule, and is the
   result classified `intact`?

**Go** if 1 holds, 2 needs no invariant exception and stays under ~300 lines with tests, and 3
passes. Otherwise **no-go**: document "use a project instruction file" as the supported way and
close the item.

## Spike result (2026-10-16): go, with a smaller model

Branch `spike/overlay-claude-rule-paths` (`7970474`, never merged): `src/overlays.ts` plus one line
each in `add` (`commands/add/plan.ts`) and `update` (`commands/update.ts`). The consumer writes
`.sigil/overlays.yaml`:

```yaml
rules:
  typescript/ts-code-quality:
    scope: [src, packages/api]
```

and each catalog glob `G` of that rule becomes `<prefix>/G`. The overlay is applied to a copy of the
resolved catalog (`appliesTo` narrowed) before the target renders, not to the rendered file.

1. **Subset check: holds, by construction.** All 106 distinct rule globs in the catalog start with
   `**/`, and `<literal prefix>/**/T` matches a subset of `**/T`. So the check is on the prefix
   only (no glob syntax, not absolute, no `.`/`..`/empty segment), never on the file system. A
   catalog glob without the `**/` lead is refused, so the guarantee never depends on the glob.
2. **Size and invariants: about 90 lines plus 2 wiring lines, no exception.** The overlay is read
   from the project directory (never `PKG_ROOT`); no config JSON is merged, so `serialize()` and
   `replaceMerge` are not involved; the manifest hash is read from the written file, so drift
   classification is unchanged; `partitionFiles` sees an ordinary `FileMap`. Every path that
   renders for a project (the add wizard's install states included) receives the catalog `add`
   or `update` built, so the two call sites cover them. `status`, `uninstall` and `prune` need no
   change: they never render.
3. **Re-apply across a catalog change: passes.** In a temp project: `add` wrote the narrowed
   `paths:`; `status` read `up to date`; a catalog edit to the same rule, then `update`, carried
   the body change with the narrowing kept, and `status` read `up to date` again; editing the
   overlay to `[lib]` and running `update` rewrote the scope; a `../x` prefix was refused with the
   reason; `uninstall` removed the file with no overlay code.

**What the spike changed in the model.** No manifest field, no fragment recording and no template
revision binding are needed: the overlay file is the record, and the hash is taken after it, so
an overlaid file is `intact`. Deleting the overlay and running `update` widens the rule back.

**Open before shipping:** Copilot (the same `appliesTo` reaches `applyTo:`, but a `**/*` rule lands
in `copilot-instructions.md` today, not tested); an invalid overlay currently fails the whole
`update`, which should name the overlay and skip only that rule; tests and docs
(`docs/guides/consuming.md`). The CTO dissent stands as a scope limit: v1 is path narrowing for
rules only.

**Decision: go** for v1 as above, as its own PR after the code-quality work, with the spike's
tests ported first (RED) and the two open items fixed.
