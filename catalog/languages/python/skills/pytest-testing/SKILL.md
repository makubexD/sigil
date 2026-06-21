---
id: python/pytest-testing
kind: skill
name: pytest-testing
title: Write pytest Tests for Python
description: >-
  Use when adding or reviewing unit and integration tests in a Python project.
  Covers project layout, fixtures, parametrize, mocking, and async test patterns.
language: python
appliesTo:
  - "**/*.py"
  - "**/pyproject.toml"
uses:
  rules:
    - python/python-style
  agents:
    - shared/code-reviewer
tags:
  - python
  - testing
  - pytest
  - mocking
---

# Writing pytest Tests for Python

When asked to add, update, or review tests in a Python project, follow these conventions.

## Project Layout

```
src/
  myapp/
    services/
      user_service.py
tests/
  conftest.py            # shared fixtures and session-level setup
  services/
    test_user_service.py # mirrors src/ structure
pyproject.toml           # [tool.pytest.ini_options] lives here
```

- Mirror the `src/` structure under `tests/`.
- Test files named `test_<module>.py`; test functions `test_<behaviour>`.
- Shared fixtures in `conftest.py` — pytest discovers these automatically.

## Naming Tests

```python
def test_get_user_returns_user_when_found():  ...
def test_get_user_raises_not_found_when_missing(): ...
```

Use `test_<subject>_<condition>_<expected_outcome>` — the same convention as xUnit but in snake_case.

## Fixtures

```python
# conftest.py
import pytest
from myapp.repositories import FakeUserRepository
from myapp.services import UserService

@pytest.fixture
def user_repo() -> FakeUserRepository:
    return FakeUserRepository()

@pytest.fixture
def user_service(user_repo: FakeUserRepository) -> UserService:
    return UserService(repo=user_repo)
```

- Inject fixtures as function arguments — pytest wires them automatically.
- Use `scope="session"` only for expensive shared state (DB setup, network).
- See `references/fixtures.md` for scope options and teardown patterns.

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
from unittest.mock import AsyncMock, MagicMock

def test_save_user_calls_repository(user_service, mocker):
    mock_save = mocker.patch.object(user_service.repo, "save")
    user = User(id=1, name="Bob")

    user_service.save(user)

    mock_save.assert_called_once_with(user)
```

## Async Tests

Install `pytest-asyncio`. Add to `pyproject.toml`:
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

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
