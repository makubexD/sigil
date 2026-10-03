# SPEC: an agnostic catalog standard

Temporary working spec for the `/feature` run. Its lasting content moves into
`docs/decisions/catalog-layout-standard-2026-10.md` and CLAUDE.md at close-out, and then this file is deleted.

## Objective

One written, enforced standard for the catalog's structure, with these properties:

- Every artifact meets each AI's minimum.
- The target layer adds AIs as data, not as provider `if` blocks.
- Wizard users, manual-CLI users and existing installs see no regression.

## Decisions

### Where an artifact goes

| Case                                                  | Where               | Notes                                                                               |
| ----------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| (a) The content does not vary by language.            | `shared/`           | Carries no `language:`.                                                             |
| (b) The content varies with the project's language.   | `languages/<lang>/` | Uses `template:` once overlap is measured. The only option for agents and rules.    |
| (c) The content varies with a stack the task chooses. | One shared skill    | Holds flat `references/stack-<stack>.md` files and a detection table in `SKILL.md`. |

- When (b) and (c) both seem to fit, choose (b).
- Grouping lives only in `packs.yaml`.
- No ids change.

### Minimum for every artifact

These are the Agent Skills spec requirements:

- `name` is kebab-case, at most 64 characters, and matches its folder.
- `description` is at most 1024 characters and says what the artifact does and when to use it.
- `SKILL.md` is under 500 lines.
- `references/` is flat, one level deep, and each file is mentioned in `SKILL.md`.

### Guards

- **Prevent:** the writers share one layout module.
- **Detect:** `catalog-layout` and `provider-limits` rules fail `sync --check`.
- **Verify the output:** `claude plugin validate --strict` runs in CI.
- **Never break:** an output snapshot test, a frozen install, and a smoke test that installs every pack.
- **No consumer impact:** `validateCatalog` gains no new errors.

### Target layer built in this run

- One generic emitter, driven by `outputPath`.
- One provider registry derived from `registerTarget()`.

Deferred until a third target exists: the TOML/JSON serializers, aggregate specs, tool aliases, and moving `claude:` into the extensions.

## Out of scope

- A new target.
- Copilot prompt → skill. Skills have no arguments.
- Removing Bash from the read-only reviewer agents.
- SHA-pinning the CI actions.
- Hoisting the release-slot text.
- An eval harness.

## Success criteria

- `npm run ci:local` is green at every commit.
- `sync --check` reports zero `catalog-layout` and `provider-limits` errors on `catalog/`.
- The snapshot is unchanged across Milestone 4.
- The frozen-install migration test is green in every milestone.
- CI wall time grows by at most 10%.

## Riskiest assumption

That the generic emitter (T16) can reproduce today's output byte for byte. N1 guards it.

## Open questions

- V1: does Copilot load reference files linked with backtick paths? You check this in VS Code.
- T14: does `claude plugin validate` run with no login? A spike settles it.
