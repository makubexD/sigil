---
id: csharp/cs-documentation
kind: rule
title: Documentation (.NET / C#)
description: C# documentation standards — XML doc comments, what to document, deprecation, GenerateDocumentationFile
language: csharp
appliesTo:
  - "**/*.cs"
tags:
  - csharp
  - documentation
appliesToRationale: Scoped to C# source because XML doc comments are authored on public members there; project and config files have no doc-comment surface.
---

## XML Docs

- Every public type and member has a `///` comment whose `<summary>` is a full sentence. Add `<param>`,
  `<returns>` and `<exception>` when the contract is not obvious from the signature.
- A library project sets `<GenerateDocumentationFile>true</GenerateDocumentationFile>`, so CS1591 flags the gaps.
- An interface documents the contract implementers must keep; an implementation uses `<inheritdoc/>`, with
  `<remarks>` for its own constraints.
- Don't restate the member name, the types, or implementation steps that will drift. No `<exception>` for an
  `ArgumentNullException` on a non-nullable parameter. A `//` comment says why, not what.
- Deprecate a public member with `[Obsolete("Use X instead.")]` and keep it working for at least one release.
- A project README covers what it does, install and quickstart, required environment variable and secret names
  (never values), and the test and quality-gate commands.
- When a signature, return contract or thrown exception changes, update the doc comment in the same commit;
  update the README when install steps, CLI usage or configuration change.
