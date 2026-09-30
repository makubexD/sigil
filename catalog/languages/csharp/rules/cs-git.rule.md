---
id: csharp/cs-git
kind: rule
title: Git (.NET / C#)
description: .NET/C#-specific git additions — secrets hygiene, Obsolete-based deprecation, dotnet pre-push gate.
language: csharp
appliesTo:
  - "**/*"
appliesToRationale: Matches shared/git — it governs commit/PR workflow, not any specific file.
severity: recommended
extends: [shared/git]
tags:
  - csharp
  - git
---

## .NET Secrets Hygiene

**Particular .NET risks:** `appsettings.Development.json`, `appsettings.local.json`,
`*.user` files, and `launchSettings.json` can embed connection strings or PATs.
Add them to `.gitignore` before creating the first commit.

Recommended `.gitignore` additions for .NET:
```gitignore
bin/
obj/
*.user
.vs/
appsettings.*.local.json
appsettings.Development.json   # if it contains real secrets
*.pfx
*.p12
secrets.json
```

## .NET Deprecation Mechanics

Mark the old member with `[Obsolete("Use X instead. This will be removed in v3.")]` and keep it
working for at least one release. Should be reviewed by `cs-api-compat-reviewer` before merging.
Don't break a caller silently — an unexpected `MissingMethodException` in downstream code is harder
to diagnose than an explicit `[Obsolete]` warning.

## Pre-Push Checklist (manual — no hooks)

Before pushing:
1. Quality gate green:
   ```bash
   dotnet format --verify-no-changes && dotnet build -warnaserror && dotnet test
   ```
2. No `appsettings.*.json` or `*.user` files staged with secrets.
3. Commit message follows the convention above.
