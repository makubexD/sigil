---
name: cs-audit-deps
description: "Audit NuGet dependencies — known CVEs, outdated versions, deprecated packages, unused references, and license compliance (.NET / C#)"
when_to_use: "Run via `/cs-audit-deps` before a release or as a periodic maintenance check — e.g. \"audit my NuGet dependencies\", \"check for known CVEs in my packages\". Produces a read-only report; no dependency changes are made. Complements cs-security-auditor, which handles code-level vulnerabilities rather than dependency CVEs."
allowed-tools: Read, Bash, Glob, Grep
argument-hint: "(no arguments)"
context: fork
---

# Audit NuGet Dependencies

This skill produces a **read-only NuGet health report** — it makes no changes.
To update or remove dependencies, act on the report's recommendations manually or via `/cs-add-package`.

## Step 1 — Discover dependency manifest

Identify all `<PackageReference>` sources:
- `Directory.Packages.props` — Central Package Management version pins (preferred for multi-project solutions).
- Each `.csproj` in `src/` and `tests/` for direct references.
- `packages.lock.json` — lock file with resolved transitive graph (if present).

Read and summarize:
- Total direct runtime dependencies (name + version).
- Total direct dev/test dependencies (`PrivateAssets="all"` or in test projects).
- Total transitive dependency count (from lock file if available).
- Target framework → **TFM** (Target Framework Moniker) and .NET SDK version.

## Step 2 — Run available tooling

Run all available commands; skip gracefully if not installed:

```bash
# CVE / vulnerability scan (built into .NET SDK 8+)
dotnet list package --vulnerable --include-transitive 2>&1

# Deprecated packages
dotnet list package --deprecated 2>&1

# Outdated versions
dotnet list package --outdated 2>&1

# License compliance (if dotnet-project-licenses is installed)
dotnet-project-licenses --input . --json 2>&1 || echo "dotnet-project-licenses not installed"

# Unused references (if ReferenceTrimmer or similar is available)
dotnet build --no-incremental 2>&1 | grep -i "unused\|unreferenced" || echo "unused-reference analysis not available"
```

Include all output verbatim in the report's "Tooling" section.

## Step 3 — Manual review

For each direct runtime dependency not already flagged by the tooling:

1. **Version constraint health:** is it pinned exactly (no floating `*` or `1.2.*`)? Is CPM in use?
   Is the lock file present and committed?
2. **Maintenance status:** when was the last release? Are critical issues open and unaddressed?
   Is the project archived or deprecated?
3. **Transitive footprint:** does it pull in a large transitive graph for a narrow use case?
   Could the BCL (`System.Text.Json`, `System.Net.Http`, etc.) replace it?
4. **Security history:** has it had CVEs in the past 12 months (check NVD / GitHub Advisory DB)?
5. **NuGet source mapping:** is `nuget.config` using package source mapping to prevent dependency
   confusion? Flag absence as Medium finding.

## Step 4 — Report

```
## Dependency Audit Report
Manifest: <Directory.Packages.props / .csproj list>
TFM: <target framework(s)>
Direct runtime deps: <N>
Direct dev/test deps: <N>
Transitive deps: <N> (from lock file) / "lock file not present"
Central Package Management: <enabled / not configured>
Lock file: <present and committed / missing>
Source mapping: <configured / not configured>

### CVEs / Security vulnerabilities
<dotnet list package --vulnerable output, or "no vulnerabilities detected">

### Deprecated packages
<dotnet list package --deprecated output, or "none detected">

### Outdated packages
<dotnet list package --outdated output, or "all up to date">

### License compliance
<dotnet-project-licenses output, or "tool not installed — manual review needed">

### Manual findings

#### High
- `<package>` — <issue>. **Recommendation:** <action>.

#### Medium
...

#### Low
...

### Summary
<N> critical/high issues requiring immediate action.
<N> medium issues recommended before next release.
<N> low/informational notes.
```

Omit tiers with no findings.

---

## Applied Rules

### Dependencies (.NET / C#)

## Prefer the BCL Before Adding a NuGet Package
Before adding a dependency, check whether the BCL (`System.*`, `Microsoft.Extensions.*`)
already covers the need: `System.Text.Json`, `System.IO`, `System.Net.Http.HttpClient`,
`Microsoft.Extensions.Logging`, `Microsoft.Extensions.Options`, `System.Security.Cryptography`,
`System.Text.RegularExpressions` with source-generated `[GeneratedRegex]`. A dependency adds
supply-chain risk; the BCL adds nothing.

## Pin All Versions
Every `<PackageReference>` must carry an **exact** pinned version — no floating specifiers (`1.2.*`,
`[1.2,)`, `*`). Pin in either the individual `.csproj` or (preferred) `Directory.Packages.props`
for Central Package Management.

Commit the **lock file** (`packages.lock.json`) to version control. Enable it:
```xml
<!-- Directory.Build.props or each .csproj -->
<PropertyGroup>
    <RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>
</PropertyGroup>
```

Run CI restore with `--locked-mode` to fail fast on lock-file drift:
```bash
dotnet restore --locked-mode
```

See `cs-nuget` for the full mechanics of Central Package Management, source mapping, and lock files.

## Separate Runtime from Dev / Analyzer Dependencies
Runtime packages go in `<PackageReference>` without attribute qualifiers.
Development-only tools (analyzers, test frameworks, coverage collectors, code-gen) go with
`PrivateAssets="all"` and optionally `IncludeAssets="runtime;build;native;contentfiles;analyzers"`:

```xml
<!-- Analyzer / dev-only — never shipped to consumers -->
<PackageReference Include="StyleCop.Analyzers" Version="1.2.0-beta.556">
    <PrivateAssets>all</PrivateAssets>
    <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
</PackageReference>

<!-- Test projects get test-framework deps at the project level only -->
<PackageReference Include="xunit" Version="2.9.3" />
<PackageReference Include="Moq" Version="4.20.72" />
```

Never install dev tools (test runners, analyzers, profilers) into production images or ship them
in NuGet packages consumed by downstream projects (`<DevelopmentDependency>true</DevelopmentDependency>`
in a library's `nuspec`/`csproj` prevents transitive spread).

## Vet Before Adding
When adding a new dependency:
1. Confirm it is actively maintained (recent release, issues addressed, not archived).
2. Check for known CVEs: `dotnet list package --vulnerable --include-transitive`.
3. Review its transitive dependency footprint: `dotnet list package --include-transitive`.
4. Confirm it is distributed via `nuget.org` (or your org's trusted feed) and is signed.
5. Check the license is compatible with the project.

See `/cs-add-package` skill for an automated vet-and-wire workflow.

## Remove Unused Dependencies
Unused `<PackageReference>` entries are dead weight and a supply-chain risk. Periodically audit
with `dotnet list package` cross-referenced against `using` directives, or use
[ReferenceTrimmer](https://github.com/Dropbox/ReferenceTrimmer). If a package is referenced in
only one place and that code is deleted, remove the `<PackageReference>` from the `.csproj`
and re-run `dotnet restore` to refresh the lock file.

## Dependency Updates
Keep dependencies reasonably current — unmaintained versions accumulate CVEs. Prefer automated
update PRs (Dependabot or Renovate) that run the full test suite before merging. Never merge a
dependency update without running the quality gate (`dotnet build -warnaserror && dotnet test`) first.

Enable `<NuGetAudit>true</NuGetAudit>` in `Directory.Build.props` so `dotnet restore` warns on
packages with known vulnerabilities:
```xml
<PropertyGroup>
    <NuGetAudit>true</NuGetAudit>
    <NuGetAuditMode>all</NuGetAuditMode>       <!-- audit transitive deps too -->
    <NuGetAuditLevel>moderate</NuGetAuditLevel> <!-- fail on Moderate+  -->
</PropertyGroup>
```

### NuGet (.NET / C#)

## Central Package Management (CPM)
Manage all package versions in one place with Central Package Management. This eliminates version
drift across projects in a multi-project solution.

**`Directory.Packages.props`** (solution root):
```xml
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
    <!-- Pin transitive deps you want to control -->
    <!-- <CentralPackageTransitivePinningEnabled>true</CentralPackageTransitivePinningEnabled> -->
  </PropertyGroup>
  <ItemGroup>
    <PackageVersion Include="xunit" Version="2.9.3" />
    <PackageVersion Include="Moq" Version="4.20.72" />
    <PackageVersion Include="Serilog" Version="4.2.0" />
  </ItemGroup>
</Project>
```

**Per-project `.csproj`** — version attribute is **omitted**; it is inherited from CPM:
```xml
<PackageReference Include="Serilog" />
```

If a project must override a version (rare, documented exception), use `VersionOverride` and add a
comment explaining why.

## Lock Files — Reproducible Restores
Enable `packages.lock.json` so every restore is reproducible:

```xml
<!-- Directory.Build.props -->
<PropertyGroup>
    <RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>
</PropertyGroup>
```

Commit `packages.lock.json` to version control. Regenerate it with:
```bash
dotnet restore --force-evaluate   # recalculate all package versions
```

In CI, pass `--locked-mode` to fail fast on lock-file drift:
```bash
dotnet restore --locked-mode
```

## Package Source Mapping (Supply-Chain Defense)
Map each package to an allowed feed in `nuget.config` — this prevents **dependency confusion
attacks** where a malicious package with the same name as an internal package is published to
`nuget.org` and pulled in ahead of your private feed.

```xml
<!-- nuget.config -->
<configuration>
  <packageSources>
    <add key="nuget.org"   value="https://api.nuget.org/v3/index.json" />
    <add key="my-private"  value="https://pkgs.dev.azure.com/my-org/_packaging/my-feed/nuget/v3/index.json" />
  </packageSources>
  <packageSourceMapping>
    <!-- All packages from my-private feed come only from my-private -->
    <packageSource key="my-private">
      <package pattern="MyOrg.*" />
    </packageSource>
    <!-- Everything else must come from nuget.org -->
    <packageSource key="nuget.org">
      <package pattern="*" />
    </packageSource>
  </packageSourceMapping>
</configuration>
```

**Never commit feed credentials** in `nuget.config`. Use `nuget.config` for source URLs and mapping
only; inject credentials via environment variables (Azure Pipelines, GitHub Actions secrets) or
`dotnet nuget add source … --username … --password … --store-password-in-clear-text`.

## NuGet Audit
Enable `<NuGetAudit>` so `dotnet restore` warns on packages with known CVEs:

```xml
<!-- Directory.Build.props -->
<PropertyGroup>
    <NuGetAudit>true</NuGetAudit>
    <NuGetAuditMode>all</NuGetAuditMode>       <!-- include transitive deps -->
    <NuGetAuditLevel>moderate</NuGetAuditLevel> <!-- Moderate, High, Critical -->
</PropertyGroup>
```

Run an explicit audit in CI:
```bash
dotnet list package --vulnerable --include-transitive
```

## Package Signing and Trusted Signers
Prefer packages that are **author-signed** and have a repository signature from `nuget.org`. For
regulated environments, enforce signature verification in `nuget.config`:

```xml
<configuration>
  <trustedSigners>
    <repository name="nuget.org" serviceIndex="https://api.nuget.org/v3/index.json">
      <certificate fingerprint="…" hashAlgorithm="SHA256" allowUntrustedRoot="false" />
    </repository>
  </trustedSigners>
</configuration>
```

## `PrivateAssets` and `IncludeAssets`
Control what flows to downstream consumers of your package:

```xml
<!-- Analyzer / build-only — never shipped as a transitive dependency -->
<PackageReference Include="Roslynator.Analyzers" Version="4.12.9">
    <PrivateAssets>all</PrivateAssets>
    <IncludeAssets>runtime; build; native; contentfiles; analyzers</IncludeAssets>
</PackageReference>
```

This is essential for analyzer and source-generator packages; if `PrivateAssets` is omitted,
the analyzer becomes a transitive dependency of every consumer of your library.

## Deterministic Builds and SourceLink
For library packages, enable deterministic builds and SourceLink so consumers can debug into
your source:

```xml
<!-- Directory.Build.props -->
<PropertyGroup>
    <Deterministic>true</Deterministic>
    <ContinuousIntegrationBuild Condition="'$(CI)' == 'true'">true</ContinuousIntegrationBuild>
    <PublishRepositoryUrl>true</PublishRepositoryUrl>
    <EmbedUntrackedSources>true</EmbedUntrackedSources>
    <!-- SourceLink for GitHub, Azure DevOps, GitLab, etc. -->
</PropertyGroup>
```

Emit symbol packages (`.snupkg`) alongside `.nupkg` so the NuGet symbol server can serve PDBs:
```bash
dotnet pack -p:SymbolPackageFormat=snupkg --include-symbols
```

## Packing and Publishing
Use `dotnet pack` and `dotnet nuget push` — do not use the `NuGet.exe` CLI for new projects.
Never store the push API key in committed files; inject via environment variable:

```bash
dotnet nuget push ./bin/Release/*.nupkg \
    --api-key "$NUGET_API_KEY" \
    --source https://api.nuget.org/v3/index.json
```

See `cs-security` for the full secrets invariant and `cs-release` skill for the end-to-end
release checklist.

### Security (.NET / C#)

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
Use `Path.GetFullPath` to normalize and assert the resolved path starts with the allowed root plus a
trailing separator — without it, `/app/data-evil` passes a check for `/app/data`.

```csharp
var safeRoot = Path.GetFullPath("/app/data") + Path.DirectorySeparatorChar;
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
