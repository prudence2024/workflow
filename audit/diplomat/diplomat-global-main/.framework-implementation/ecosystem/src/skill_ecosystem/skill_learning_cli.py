"""CLI for recommendation-only first-party skill research."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

from .errors import EcosystemError
from .skill_learning import compare_skills, record_decision
from .skill_learning_validation import validate_skill_learning


def _root(value: str) -> Path:
    path = Path(value).resolve()
    if not path.is_dir():
        raise argparse.ArgumentTypeError(f"Repository root does not exist: {path}")
    return path


def _emit(value: object) -> None:
    print(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="skill-learning")
    parser.add_argument("--root", type=_root, default=Path.cwd())
    subparsers = parser.add_subparsers(dest="command", required=True)

    compare = subparsers.add_parser("compare", help="Create recommendation-only comparisons")
    compare.add_argument("--skill", action="append")

    decide = subparsers.add_parser("decide", help="Record a human recommendation decision")
    decide.add_argument("--recommendation", required=True)
    decide.add_argument("--decision", choices=("approved", "rejected"), required=True)
    decide.add_argument("--reviewer", required=True)
    decide.add_argument("--reason", required=True)
    decide.add_argument("--decided-at")

    subparsers.add_parser("validate", help="Validate research sources and outputs")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "compare":
            _emit(compare_skills(args.root, skill_ids=args.skill or ()))
            return 0
        if args.command == "decide":
            _emit(
                record_decision(
                    args.root,
                    recommendation_id=args.recommendation,
                    decision=args.decision,
                    reviewer=args.reviewer,
                    reason=args.reason,
                    decided_at=args.decided_at,
                )
            )
            return 0
        result = validate_skill_learning(args.root)
        _emit(result)
        return 0 if result["status"] == "pass" else 1
    except (EcosystemError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
