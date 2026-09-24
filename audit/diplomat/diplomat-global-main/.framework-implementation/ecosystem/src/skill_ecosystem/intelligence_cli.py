"""Command line interface for the isolated Design Intelligence Framework."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

from .design_extraction import extract_observations
from .design_ingestion import IngestionRequest, ingest_zip
from .design_intelligence_validation import validate_design_intelligence
from .design_normalization import normalize_knowledge
from .errors import EcosystemError
from .knowledge import KnowledgeQuery, load_patterns, query_patterns


def _root(value: str) -> Path:
    path = Path(value).resolve()
    if not path.is_dir():
        raise argparse.ArgumentTypeError(f"Repository root does not exist: {path}")
    return path


def _csv(values: list[str] | None) -> tuple[str, ...]:
    return tuple(item for value in (values or []) for item in value.split(",") if item)


def _emit(data: object) -> None:
    print(json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="design-intelligence")
    parser.add_argument("--root", type=_root, default=Path.cwd())
    subparsers = parser.add_subparsers(dest="command", required=True)

    ingest = subparsers.add_parser("ingest", help="Safely ingest an approved ZIP archive")
    ingest.add_argument("--archive", type=Path, required=True)
    ingest.add_argument("--source-id", required=True)
    ingest.add_argument("--capture-id", required=True)
    ingest.add_argument("--source", required=True)
    ingest.add_argument("--captured-at", required=True)
    ingest.add_argument("--permitted-use", required=True)
    ingest.add_argument("--independence-group", required=True)
    ingest.add_argument("--ingested-by", required=True)
    ingest.add_argument("--source-quality", type=float, default=0.5)
    ingest.add_argument(
        "--content-origin",
        choices=("owner-supplied", "approved-external-reference"),
        default="owner-supplied",
    )

    extract = subparsers.add_parser("extract", help="Extract static pattern observations")
    extract.add_argument("--source-id", required=True)
    extract.add_argument("--capture-id", required=True)
    extract.add_argument("--industry", action="append")
    extract.add_argument("--contextual-relevance", type=float, default=0.7)
    extract.add_argument("--freshness", type=float, default=1.0)

    normalize = subparsers.add_parser("normalize", help="Build domain knowledge records")
    normalize.add_argument("--approval-file", type=Path)

    query = subparsers.add_parser("query", help="Query validated domain knowledge")
    query.add_argument("--domain", action="append")
    query.add_argument("--industry", action="append")
    query.add_argument("--ux-goal", action="append")
    query.add_argument("--accessibility", action="append")
    query.add_argument("--performance", action="append")
    query.add_argument("--confidence-level", action="append")
    query.add_argument("--min-evidence-confidence", type=float, default=0.0)
    query.add_argument("--min-recommendation-score", type=float, default=0.0)
    query.add_argument("--text")

    subparsers.add_parser("validate", help="Validate ingestion, evidence, knowledge, and provenance")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "ingest":
            archive = args.archive if args.archive.is_absolute() else Path.cwd() / args.archive
            _emit(
                ingest_zip(
                    args.root,
                    IngestionRequest(
                        archive=archive.resolve(),
                        source_id=args.source_id,
                        capture_id=args.capture_id,
                        source=args.source,
                        captured_at=args.captured_at,
                        permitted_use=args.permitted_use,
                        independence_group=args.independence_group,
                        ingested_by=args.ingested_by,
                        source_quality=args.source_quality,
                        content_origin=args.content_origin,
                    ),
                )
            )
            return 0
        if args.command == "extract":
            _emit(
                extract_observations(
                    args.root,
                    source_id=args.source_id,
                    capture_id=args.capture_id,
                    industries=_csv(args.industry),
                    contextual_relevance=args.contextual_relevance,
                    freshness=args.freshness,
                )
            )
            return 0
        if args.command == "normalize":
            _emit(normalize_knowledge(args.root, approval_path=args.approval_file))
            return 0
        if args.command == "query":
            patterns, issues = load_patterns(args.root)
            if issues:
                raise EcosystemError(f"Knowledge base has {len(issues)} validation issue(s)")
            matches = query_patterns(
                patterns,
                KnowledgeQuery(
                    domains=_csv(args.domain),
                    industries=_csv(args.industry),
                    ux_goals=_csv(args.ux_goal),
                    accessibility=_csv(args.accessibility),
                    performance=_csv(args.performance),
                    confidence_levels=_csv(args.confidence_level),
                    min_evidence_confidence=args.min_evidence_confidence,
                    min_recommendation_score=args.min_recommendation_score,
                    text=args.text,
                ),
            )
            _emit({"count": len(matches), "patterns": matches})
            return 0
        result = validate_design_intelligence(args.root)
        _emit(result)
        return 0 if result["status"] == "pass" else 1
    except (EcosystemError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
