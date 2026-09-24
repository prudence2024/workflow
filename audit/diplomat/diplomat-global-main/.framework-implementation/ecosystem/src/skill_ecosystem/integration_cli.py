"""CLI for complete Phase 7 repository validation."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence

from .integration_validation import validate_integration
from .reporting import render_markdown


def _root(value: str) -> Path:
    path = Path(value).resolve()
    if not path.is_dir():
        raise argparse.ArgumentTypeError(f"Repository root does not exist: {path}")
    return path


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ecosystem-integrate")
    parser.add_argument("--root", type=_root, default=Path.cwd())
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args(argv)
    report = validate_integration(args.root)
    print(
        render_markdown(report)
        if args.markdown
        else json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False)
    )
    return 0 if report["summary"]["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
