"""The queue worker."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass


@dataclass
class Job:
    id: int


Handle = Callable[[Job], Awaitable[None]]
"""Does the work of one job. It can raise."""
