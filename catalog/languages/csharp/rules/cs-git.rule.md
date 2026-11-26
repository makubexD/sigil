---
id: csharp/cs-git
kind: rule
title: Git (.NET / C#)
description: .NET .gitignore additions — build output, IDE state and local settings that can hold secrets
language: csharp
appliesTo:
  - "**/.gitignore"
appliesToRationale: Scoped to .gitignore because the .NET-specific additions apply on top of the shared git baseline.
extends:
  - shared/git
tags:
  - csharp
  - git
---

## .NET `.gitignore` Additions

Standard .NET additions on top of the shared baseline. `appsettings.Development.json`, `*.user` and
`launchSettings.json` can hold connection strings or tokens.

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
