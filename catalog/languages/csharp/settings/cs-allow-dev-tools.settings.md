---
id: csharp/cs-allow-dev-tools
kind: settings
title: "Allow Dev Tools (.NET / C#)"
description: >-
  Grants Claude Code permission to run the standard .NET / C# development commands (dotnet build,
  test, format, restore) without per-call confirmation (C#)
language: csharp
permissions:
  allow:
    - "Bash(dotnet build *)"
    - "Bash(dotnet test *)"
    - "Bash(dotnet format *)"
    - "Bash(dotnet restore *)"
tags: [permissions, developer-experience, csharp]
---

Merges a curated set of `permissions.allow` entries into your `.claude/settings.json` using
array-union semantics: your existing allow entries are preserved; only missing entries are added.

**What's allowed:**
- `dotnet build *`, `dotnet test *`: build and test the solution or a project
- `dotnet format *`: apply or verify the formatting and analyzer rules
- `dotnet restore *`: restore NuGet packages

Not `dotnet run`: it executes the application, which stays a per-call decision. No `git` entries:
Claude Code already runs read-only commands such as `git status` and `git diff` without a prompt.

To allow more commands, install another settings artifact with extra allow entries or use
`sigil patch csharp/cs-allow-dev-tools --add-permission-allow "Bash(your-command)"`.
