---
id: csharp/cs-security
kind: rule
title: Security (.NET / C#)
description: C# security invariants — secrets, SQL injection, deserialization, secure randomness, TLS
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
- Start a process with `ProcessStartInfo.ArgumentList` and `UseShellExecute = false`, never an interpolated
  command line.
- SQL is parameterized: EF Core LINQ or `FromSqlInterpolated`, Dapper parameters, `SqlParameter`. Never
  `FromSqlRaw` or a command built by concatenation.
- A user-supplied path goes through `Path.GetFullPath` and must start with the allowed root plus
  `Path.DirectorySeparatorChar`.
- Never `BinaryFormatter`, `LosFormatter`, or Newtonsoft `TypeNameHandling.All` / `Auto` on untrusted data. An
  `XmlReader` sets `DtdProcessing = DtdProcessing.Prohibit` and `XmlResolver = null`.
- Tokens and nonces come from `RandomNumberGenerator`, never `System.Random`; compare secrets with
  `CryptographicOperations.FixedTimeEquals`, never `==`.
- Every `HttpClient` call has a timeout or a `CancellationToken`, and clients come from `IHttpClientFactory`.
  Never a certificate callback that returns `true` outside tests. A request built from user input goes to an
  allowlisted host.
