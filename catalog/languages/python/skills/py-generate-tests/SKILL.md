---
id: python/py-generate-tests
kind: skill
name: py-generate-tests
title: Write pytest Tests for Python
description: Use when adding or reviewing unit and integration tests in a Python project. Covers project layout, fixtures, parametrize, mocking, and async test patterns.
language: python
uses:
  rules:
    - python/py-conventions
  agents:
    - python/py-code-reviewer
tags:
  - python
  - testing
  - pytest
  - mocking
whenToUse: "Use when adding, updating, or reviewing tests in a Python project — e.g. \"write tests for this service\", \"add pytest fixtures\", \"review my test coverage\". Covers project layout, fixtures, parametrize, mocking, and async test patterns."
---# Writing pytest Tests for Python

When asked to add, update, or review tests in a Python project, follow these conventions.

## Project Layout

Mirror `src/`'s structure under `tests/` (`src/myapp/services/user_service.py` →
`tests/services/test_user_service.py`), test files named `test_<module>.py`, and shared fixtures in
`conftest.py` (pytest discovers it automatically). Name tests
`test_<subject>_<condition>_<expected_outcome>` — the same convention as xUnit but snake_case.

## Fixtures

```python
# conftest.py
@pytest.fixture
def user_repo() -> FakeUserRepository:
    return FakeUserRepository()

@pytest.fixture
def user_service(user_repo: FakeUserRepository) -> UserService:
    return UserService(repo=user_repo)
```

Inject fixtures as function arguments — pytest wires them automatically. Use `scope="session"` only
for expensive shared state (DB setup, network). See `references/fixtures.md` for scope options and
teardown patterns.

## Arrange / Act / Assert

```python
def test_get_user_returns_user_when_found(user_service, user_repo):
    # Arrange
    user_repo.add(User(id=42, name="Alice"))

    # Act
    result = user_service.get_user(42)

    # Assert
    assert result.id == 42
    assert result.name == "Alice"
```

## Parametrize

```python
@pytest.mark.parametrize("email,expected", [
    ("alice@example.com", True),
    ("not-an-email", False),
    ("", False),
    (None, False),
])
def test_validate_email(email: str | None, expected: bool):
    assert validate_email(email) == expected
```

## Mocking with `pytest-mock` / `unittest.mock`

```python
def test_save_user_calls_repository(user_service, mocker):
    mock_save = mocker.patch.object(user_service.repo, "save")
    user_service.save(User(id=1, name="Bob"))
    mock_save.assert_called_once()
```

## Async Tests

Install `pytest-asyncio` and set `asyncio_mode = "auto"` under `[tool.pytest.ini_options]` in
`pyproject.toml`, then write `async def` tests directly:
```python
async def test_fetch_user_async(user_service):
    result = await user_service.get_user_async(42)
    assert result is not None
```

## Expected Exceptions

```python
import pytest

def test_get_user_raises_not_found_when_missing(user_service):
    with pytest.raises(UserNotFoundError, match="42"):
        user_service.get_user(42)
```

## What NOT to test

- Third-party library internals (SQLAlchemy queries, FastAPI routing).
- Private functions — test them through the public interface.
- Trivial properties or `__repr__` implementations.
