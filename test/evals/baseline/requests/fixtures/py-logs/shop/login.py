"""Customer sign-in."""

from collections.abc import Callable
from dataclasses import dataclass, field


@dataclass
class LoginRequest:
    username: str
    password: str
    ip: str
    headers: dict[str, str] = field(default_factory=dict)


Authenticate = Callable[[str, str], bool]
"""Checks a username and password against the accounts database."""
