"""Runs the command-line tools under tools/ on uploaded files."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPLOADS = ROOT / "uploads"
WORDCOUNT = ROOT / "tools" / "wordcount.py"
