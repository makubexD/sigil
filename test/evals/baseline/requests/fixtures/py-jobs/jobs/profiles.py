"""Customer profiles from the profile service."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass


@dataclass
class Profile:
    id: str
    name: str


Fetch = Callable[[str], Awaitable[Profile]]
"""Gets one profile from the profile service."""
