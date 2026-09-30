---
id: shared/templates/release-skill
kind: template
title: "Language Release-Preparation Skill"
description: >-
  Shared skeleton for a language's `*-release` skill: the title, target-version line, the
  user-invoked disclaimer, and the working-tree-check step are identical across languages
  (confirmed via body-shingle overlap analysis, docs/audits/2026-08-20/analysis/lane-d-duplication.json
  — the second-highest cross-language overlap in the catalog at ~0.41). Quality-gate discovery,
  version-source, changelog shape, and the publish checklist stay per-language slots because each
  language's actual toolchain (npm/dotnet/ng) and registry differ.
appliesToKind:
  - skill
revision: 1
slots:
  - key: quality-gates
    required: true
    description: >-
      Step 1: how to discover and run this language's full quality gate, and what to do when it
      fails.
  - key: version-determination
    required: true
    description: >-
      Step 3: where this language reads its current version from, and the commit-type-to-bump-type
      rules (including any language-specific api-compat-reviewer override).
  - key: changelog-format
    required: true
    description: >-
      Step 4: the changelog section headings this language groups commits into (e.g. whether a
      dedicated Breaking Changes / Performance section exists).
  - key: api-compat-step
    required: false
    description: >-
      An optional standalone step checking a prior api-compat-reviewer report against the proposed
      bump, for languages that give this its own step rather than folding it into quality gates.
  - key: checklist-and-next-steps
    required: true
    description: >-
      The final output checklist template plus the numbered human-action next-steps, ending in
      this language's actual publish command(s).
docs:
  - url: "https://semver.org/"
    verifiedOn: "2026-08-20"
    covers: "SemVer major/minor/patch classification this template's version-determination slot applies per language."
tags: [shared, skill, template, release]
---
# Release Preparation

**Target version:** {sigil:arguments}

> This skill is **user-invoked only** (`disable-model-invocation: true`). It prepares
> the release but does **not** create a tag, push to remote, or publish to a registry.
> All final actions require human confirmation.

## Step 1 — Verify quality gates

<!-- slot: quality-gates -->

## Step 2 — Check the working tree

```bash
git status --porcelain
git stash list
```

If there are uncommitted changes or stashes, **report and stop** — a release must be cut from a
clean working tree.

Note the current branch and whether it is ahead of or behind the remote:
```bash
git log --oneline origin/main..HEAD
```

## Step 3 — Determine the version

**If `{sigil:arguments}` is provided:** use that as the target version.

**If `{sigil:arguments}` is empty:**
<!-- slot: version-determination -->
Ask the user to confirm the version before proceeding.

## Step 4 — Generate changelog

<!-- slot: changelog-format -->

Omit sections with no entries.

<!-- slot: api-compat-step -->

## Output Release Checklist

<!-- slot: checklist-and-next-steps -->
