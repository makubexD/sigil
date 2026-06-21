---
id: csharp/xunit-testing
kind: skill
name: xunit-testing
title: Write xUnit Tests for .NET
description: >-
  Use when adding or reviewing unit tests in a C#/.NET project. Covers file organisation,
  naming, structure, xUnit attributes, Moq, and async test patterns.
language: csharp
appliesTo:
  - "**/*.cs"
  - "**/*.csproj"
uses:
  rules:
    - csharp/dotnet-style
  agents:
    - shared/code-reviewer
tags:
  - csharp
  - testing
  - xunit
  - moq
---

# Writing xUnit Tests for .NET

When asked to add, update, or review unit tests in a .NET project, follow these conventions.

## Project & File Organisation

- Test project name: `<SourceProject>.Tests.csproj`. Place it alongside the source project, not in a nested folder.
- One test file per class under test, named `<ClassName>Tests.cs`.
- Mirror the namespace: `MyApp.Services` → `MyApp.Services.Tests`.

## Test Class Structure

```csharp
public class UserServiceTests
{
    private readonly Mock<IUserRepository> _repoMock;
    private readonly UserService _sut;   // sut = System Under Test

    public UserServiceTests()
    {
        _repoMock = new Mock<IUserRepository>();
        _sut = new UserService(_repoMock.Object);
    }
}
```

- Inject mocks in the constructor — xUnit creates a new instance per test, keeping tests isolated.
- Name the class under test `_sut` to make the test's subject obvious.

## Naming Tests

Use the pattern: `MethodName_Condition_ExpectedOutcome`

```csharp
[Fact]
public async Task GetUserAsync_UserNotFound_ThrowsNotFoundException() { ... }

[Theory]
[InlineData("")]
[InlineData(null)]
[InlineData("   ")]
public void ValidateEmail_InvalidInput_ReturnsFalse(string? email) { ... }
```

## Arrange / Act / Assert

Separate the three phases with blank lines and `// Arrange` / `// Act` / `// Assert` comments:

```csharp
[Fact]
public async Task GetUserAsync_ValidId_ReturnsUser()
{
    // Arrange
    var userId = Guid.NewGuid();
    var expected = new User { Id = userId, Name = "Alice" };
    _repoMock.Setup(r => r.FindByIdAsync(userId)).ReturnsAsync(expected);

    // Act
    var result = await _sut.GetUserAsync(userId);

    // Assert
    Assert.Equal(expected.Id, result.Id);
    Assert.Equal(expected.Name, result.Name);
    _repoMock.Verify(r => r.FindByIdAsync(userId), Times.Once);
}
```

## Assertions

See `references/assertions.md` for the full cheat-sheet. Key rules:
- `Assert.Equal(expected, actual)` — note the **expected-first** convention.
- `Assert.NotNull(obj)` before accessing `obj` properties.
- `await Assert.ThrowsAsync<TException>(async () => await _sut.MethodAsync())` for exceptions.

## Async Tests

- Return `Task`, never `void` — `async void` tests hide failures.
- `await` everything — never use `.Result` or `.Wait()`.

## Mocking with Moq

```csharp
// Setup a return value
_repoMock.Setup(r => r.FindByIdAsync(It.IsAny<Guid>())).ReturnsAsync(user);

// Verify a call happened once
_repoMock.Verify(r => r.SaveAsync(It.Is<User>(u => u.Id == userId)), Times.Once);

// Setup an exception
_repoMock.Setup(r => r.FindByIdAsync(badId)).ThrowsAsync(new NotFoundException());
```

## What NOT to test

- Private methods — test them through the public surface.
- Framework code (Entity Framework queries, HttpClient wiring) — use integration tests.
- Trivial properties with no logic — they add noise without value.
