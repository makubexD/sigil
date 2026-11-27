"""Adds the region of each account key, from the legacy directory."""

import time


def slow_lookup(key: str) -> str:
    """The legacy directory client. It has no async form and takes a while to answer."""
    time.sleep(0.2)
    return f"region-{key}"
