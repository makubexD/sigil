---
id: csharp/cs-security
kind: rule
title: Security (.NET / C#)
description: C# security invariants — secrets, SQL injection, deserialization, secure randomness, TLS
language: csharp
appliesTo:
  - "**/*.cs"
severity: required
extends: []
tags:
  - csharp
  - security
---

## Secrets and Credentials
Credentials, tokens, API keys, and private keys **must never** appear in source files, committed
`appsettings.json` / `appsettings.*.json`, log statements, exception messages, or
`ToString()`/`GetDebuggerDisplay()` output.

Read secrets from:
- `IConfiguration` backed by environment variables or Azure Key Vault.
- `dotnet user-secrets` (development only — never committed).
- A secrets manager (Azure Key Vault, AWS Secrets Manager, HashiCorp Vault).

```csharp
// Correct — read from IConfiguration
var token = configuration["AzureDevOps:PersonalAccessToken"]
    ?? throw new InvalidOperationException("ADO_MCP_PERSONAL_TOKEN is not set.");

// Wrong — hardcoded fallback is a committed secret
var token = configuration["AzureDevOps:PersonalAccessToken"] ?? "dev-pat-do-not-commit";
```

Document required environment variables in `README.md` or `.env.example` (names only, never values).

## Shell Injection
Never construct shell commands by string concatenation or `$"…"` interpolation with
external or user-supplied input. Use `ProcessStartInfo.ArgumentList` (a `IList<string>`) to pass
arguments safely — never `UseShellExecute = true` with untrusted input.

```csharp
// Correct
var psi = new ProcessStartInfo("git")
{
    UseShellExecute = false,
    RedirectStandardOutput = true,
};
psi.ArgumentList.Add("log");
psi.ArgumentList.Add("--oneline");
psi.ArgumentList.Add(branchName);  // not injected; passed as a distinct argument

// Wrong — injection via branchName
Process.Start("cmd.exe", $"/c git log --oneline {branchName}");
```

## SQL Injection
Never construct SQL by concatenation or interpolation with user-supplied input. Always use:
- **EF Core**: LINQ queries, `FromSqlInterpolated` (`$"…"` is safe — it parameterizes automatically),
  never `FromSqlRaw` with string concatenation.
- **Dapper**: parameterized queries — pass an anonymous object, never inline values.
- **ADO.NET**: `SqlCommand.Parameters.AddWithValue(…)` or typed parameters.

```csharp
// Correct — EF Core parameterized
var user = await db.Users.Where(u => u.Email == email).FirstOrDefaultAsync();

// Correct — Dapper parameterized
var user = await conn.QueryFirstOrDefaultAsync<User>(
    "SELECT * FROM Users WHERE Email = @Email", new { Email = email });

// Wrong — string concatenation
var user = await conn.QueryFirstOrDefaultAsync<User>(
    $"SELECT * FROM Users WHERE Email = '{email}'");
```

## Path Traversal
Validate user-supplied filesystem paths against an allowed root before opening them.
Use `Path.GetFullPath` to normalize and assert the resolved path starts with the allowed root.

```csharp
var safeRoot = Path.GetFullPath("/app/data");
var requested = Path.GetFullPath(Path.Combine(safeRoot, userPath));
if (!requested.StartsWith(safeRoot, StringComparison.Ordinal))
    throw new UnauthorizedAccessException("Path traversal detected.");
```

## Unsafe Deserialization
- **`BinaryFormatter`** — **always banned**; it is a known RCE vector and is obsoleted in modern
  .NET. Use `System.Text.Json`, `MessagePack`, or `Google.Protobuf` instead.
- **Newtonsoft.Json `TypeNameHandling.All` / `TypeNameHandling.Auto`** — **always unsafe on
  untrusted data**; enables polymorph RCE. Use `System.Text.Json` with discriminated union
  converters instead.
- **`LosFormatter` / `ObjectStateFormatter`** — same risks as `BinaryFormatter`; banned.
- **`XmlReader`**: set `DtdProcessing = DtdProcessing.Prohibit` and `XmlResolver = null` to
  prevent XXE (XML External Entity) injection.
- **`System.Text.Json`**: safe by default; avoid `JsonSerializerOptions` with custom converters
  that call `Activator.CreateInstance` on type names from untrusted data.

## Secure Randomness
Use `System.Security.Cryptography.RandomNumberGenerator` for cryptographic tokens, nonces, and
session identifiers. `System.Random` is **not** cryptographically secure.

```csharp
// Correct
var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));

// Wrong — predictable
var token = new Random().Next().ToString();
```

## Timing-Safe Comparison
Compare secrets and HMACs with `CryptographicOperations.FixedTimeEquals`, not `==` or
`string.Equals`. Direct equality comparison is vulnerable to timing side-channel attacks.

```csharp
// Correct
var isValid = CryptographicOperations.FixedTimeEquals(
    Encoding.UTF8.GetBytes(provided),
    Encoding.UTF8.GetBytes(expected));
```

## Network I/O
- Always set a timeout on `HttpClient` requests via `HttpClient.Timeout` or a
  `CancellationToken` — a missing timeout can hang indefinitely.
- Prefer **`IHttpClientFactory`** (registered via `AddHttpClient<T>(…)`) over manually managing
  `HttpClient` instances — avoids socket exhaustion.
- Never disable TLS verification via
  `ServerCertificateCustomValidationCallback = (_, _, _, _) => true`
  except in test environments, and never without a documented justification.
- Validate redirect targets; never follow arbitrary redirects from user-controlled input (SSRF vector).
  Use an explicit allowlist for permitted hosts.
