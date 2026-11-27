---
id: csharp/cs-security
kind: rule
title: Security (.NET / C#)
description: C# security invariants — secrets, deserialization, HTTP timeouts and TLS
language: csharp
appliesTo:
  - "**/*.cs"
severity: required
tags:
  - csharp
  - security
appliesToRationale: Scoped to C# source because every threat surface this rule covers — secrets, injection, deserialization, randomness — is exercised in application code, not project or config files.
---

## Security

- No secrets in source, committed `appsettings*.json`, logs, exception messages or `ToString()` output. Read them
  from `IConfiguration` (environment variables or a vault; `dotnet user-secrets` in development) and throw when
  one is missing; no hardcoded fallback.
- Never `BinaryFormatter`, `LosFormatter`, or Newtonsoft `TypeNameHandling.All` / `Auto` on untrusted data. An
  `XmlReader` sets `DtdProcessing = DtdProcessing.Prohibit` and `XmlResolver = null`.
- Every `HttpClient` call has a timeout or a `CancellationToken`, and clients come from `IHttpClientFactory`.
  Never a certificate callback that returns `true` outside tests. A request built from user input goes to an
  allowlisted host.
