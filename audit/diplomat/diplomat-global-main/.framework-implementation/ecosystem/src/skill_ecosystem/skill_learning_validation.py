"""Validation for approved sources, recommendations, reports, and decisions."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from jsonschema.exceptions import SchemaError

from .io import load_json, load_yaml
from .models import Issue
from .schema import load_schema, validate_instance
from .skill_learning import load_approved_sources

_SCHEMAS = (
    "research-policy.json",
    "research-source.json",
    "skill-recommendation.json",
    "research-run.json",
    "recommendation-decision.json",
)


def _documents(root: Path, relative: str) -> list[Path]:
    base = root / relative
    if not base.exists():
        return []
    return sorted(base.rglob("*.yaml")) + sorted(base.rglob("*.yml")) + sorted(base.rglob("*.json"))


def _load(path: Path):
    return load_json(path) if path.suffix.casefold() == ".json" else load_yaml(path)


def validate_skill_learning(root: Path) -> dict[str, Any]:
    root = root.resolve()
    issues: list[Issue] = []
    evidence: list[str] = []
    for name in _SCHEMAS:
        path = root / "ecosystem" / "schemas" / name
        try:
            load_schema(path.resolve())
            evidence.append(f"Valid schema: {path.relative_to(root).as_posix()}")
        except (OSError, SchemaError, Exception) as exc:
            issues.append(Issue("research.schema.invalid", str(exc), path=str(path)))

    policy_path = root / "research" / "config" / "source-policy.yaml"
    try:
        policy = load_yaml(policy_path)
        issues.extend(
            validate_instance(
                policy,
                root / "ecosystem" / "schemas" / "research-policy.json",
                subject="research policy",
            )
        )
    except Exception as exc:
        issues.append(Issue("research.policy.invalid", str(exc), path=str(policy_path)))

    sources, source_issues = load_approved_sources(root)
    issues.extend(Issue("research.source.invalid", message) for message in source_issues)
    recommendations: dict[str, dict[str, Any]] = {}
    for path in _documents(root, "research/recommendations"):
        try:
            value = _load(path)
            validation = validate_instance(
                value,
                root / "ecosystem" / "schemas" / "skill-recommendation.json",
                subject=f"recommendation {path.name}",
            )
            issues.extend(validation)
            if not validation:
                recommendations[value["id"]] = value
                if value["approval_required"] is not True:
                    issues.append(Issue("research.approval.missing", f"{value['id']} is not approval gated"))
        except Exception as exc:
            issues.append(Issue("research.recommendation.invalid", str(exc), path=str(path)))

    reports = 0
    for path in _documents(root, "research/reports"):
        try:
            value = _load(path)
            issues.extend(
                validate_instance(
                    value,
                    root / "ecosystem" / "schemas" / "research-run.json",
                    subject=f"research run {path.name}",
                )
            )
            reports += 1
        except Exception as exc:
            issues.append(Issue("research.report.invalid", str(exc), path=str(path)))

    decisions = 0
    for path in _documents(root, "research/decisions"):
        try:
            value = _load(path)
            validation = validate_instance(
                value,
                root / "ecosystem" / "schemas" / "recommendation-decision.json",
                subject=f"recommendation decision {path.name}",
            )
            issues.extend(validation)
            if not validation and value["recommendation_id"] not in recommendations:
                issues.append(
                    Issue(
                        "research.decision.orphaned",
                        f"Decision references missing recommendation {value['recommendation_id']}",
                        path=str(path),
                    )
                )
            decisions += 1
        except Exception as exc:
            issues.append(Issue("research.decision.invalid", str(exc), path=str(path)))

    status = "fail" if any(issue.severity == "error" for issue in issues) else "pass"
    return {
        "schema_version": 1,
        "framework": "skill-learning",
        "status": status,
        "summary": {
            "approved_sources": len(sources),
            "recommendations": len(recommendations),
            "reports": reports,
            "decisions": decisions,
            "issues": len(issues),
        },
        "evidence": evidence + [
            "Recommendation-only policy validated",
            "No automatic apply command is implemented",
        ],
        "issues": [issue.as_dict() for issue in issues],
    }
