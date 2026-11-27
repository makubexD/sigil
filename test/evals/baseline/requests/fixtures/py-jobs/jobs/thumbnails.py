"""Thumbnails for uploaded images."""

from collections.abc import Awaitable, Callable

Resize = Callable[[str], Awaitable[str]]
"""Opens the image at a path, writes its thumbnail and returns the thumbnail's path."""
