"""Prints how many words the file given as the only argument holds."""

import sys
from pathlib import Path

print(len(Path(sys.argv[1]).read_text(encoding="utf-8").split()))
