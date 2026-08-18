"""Allow running `python -m ingest` directly."""

import os
import sys
from pathlib import Path

_project_root = Path(__file__).resolve().parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

from ingest.cli import main

if __name__ == "__main__":
    main()
