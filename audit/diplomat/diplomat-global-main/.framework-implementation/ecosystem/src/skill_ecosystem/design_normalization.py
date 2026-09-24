"""Normalize internal observations into domain-oriented canonical knowledge."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any, Iterable

import yaml

from .design_extraction import load_observations
from .design_scoring import FORMULA_VERSION, observation_weight, score_pattern
from .errors import EcosystemError
from .io import load_yaml
from .schema import validate_instance

_QUALITY_VALUE = {"supports": 1.0, "neutral": 0.7, "unknown": 0.5, "risk": 0.2}


def _unique(values: Iterable[str]) -> list[str]:
    return sorted({value for value in values if value})


def _weighted_mean(observations: list[dict[str, Any]], field: str) -> float:
    total = sum(observation_weight(item) for item in observations)
    if total <= 0:
        return 0.5
    return sum(float(item[field]) * observation_weight(item) for item in observations) / total


def _quality(observations: list[dict[str, Any]], field: str) -> dict[str, Any]:
    total = sum(observation_weight(item) for item in observations)
    value = (
        sum(_QUALITY_VALUE[item[field]] * observation_weight(item) for item in observations)
        / total
        if total
        else 0.5
    )
    rating = "supports" if value >= 0.82 else ("neutral" if value >= 0.58 else ("risk" if value < 0.38 else "unknown"))
    return {
        "rating": rating,
        "tags": _unique(tag for item in observations for tag in item.get("tags", [])),
        "notes": [f"Weighted {field} evidence score: {value:.4f}."],
    }


def _load_approval(root: Path, approval_path: Path | None) -> tuple[set[str], list[str]]:
    if approval_path is None:
        return set(), []
    path = approval_path if approval_path.is_absolute() else root / approval_path
    approval = load_yaml(path)
    issues = validate_instance(
        approval,
        root / "ecosystem" / "schemas" / "knowledge-approval.json",
        subject="knowledge approval",
    )
    if issues:
        raise EcosystemError(issues[0].message)
    return set(approval["approved_established_patterns"]), [approval["reviewer"]]


def _provenance(observations: list[dict[str, Any]]) -> list[dict[str, str]]:
    seen: set[tuple[str, str, str, str]] = set()
    values: list[dict[str, str]] = []
    for item in observations:
        key = (
            item["source_id"],
            item["capture_id"],
            item["independence_group"],
            item["provenance"]["manifest"],
        )
        if key in seen:
            continue
        seen.add(key)
        values.append(
            {
                "source_id": key[0],
                "capture_id": key[1],
                "independence_group": key[2],
                "manifest": key[3],
            }
        )
    return sorted(values, key=lambda item: (item["independence_group"], item["source_id"], item["capture_id"]))


def normalize_knowledge(
    root: Path,
    *,
    approval_path: Path | None = None,
) -> dict[str, Any]:
    root = root.resolve()
    observations, load_issues = load_observations(root)
    if load_issues:
        raise EcosystemError(f"Observation store has {len(load_issues)} validation issue(s)")
    approved, reviewers = _load_approval(root, approval_path)
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for observation in observations:
        grouped[(observation["domain"], observation["pattern_key"])].append(observation)

    outputs: list[str] = []
    classifications: dict[str, int] = defaultdict(int)
    schema_path = root / "ecosystem" / "schemas" / "knowledge-pattern.json"
    today = date.today().isoformat()
    for (domain, pattern_id), items in sorted(grouped.items()):
        scores = score_pattern(items, approved_established=pattern_id in approved)
        positive = [item["id"] for item in items if item["evidence_kind"] == "positive"]
        negative = [item["id"] for item in items if item["evidence_kind"] == "negative"]
        contradictory = [item["id"] for item in items if item["evidence_kind"] == "contradictory"]
        observed_dates = sorted(item["extracted_at"][:10] for item in items)
        first = items[0]
        pattern = {
            "schema_version": 1,
            "id": pattern_id,
            "domain": domain,
            "name": first["name"],
            "summary": first["summary"],
            "status": "approved" if scores.approval_recorded else "draft",
            "problem": first["problem"],
            "mechanism": first["mechanism"],
            "composition_guidance": [
                "Combine this principle with project context and other compatible patterns.",
                "Adapt hierarchy, content, and implementation rather than reproducing a source composition.",
            ],
            "implementation_guidance": [
                "Prefer the project's existing design system and framework primitives.",
                "Validate accessibility, performance, responsiveness, and failure behavior.",
            ],
            "variants": [],
            "related_patterns": [],
            "industries": _unique(value for item in items for value in item["industries"]),
            "ux_goals": _unique(value for item in items for value in item["ux_goals"]),
            "contexts": _unique(value for item in items for value in item["contexts"]),
            "tags": _unique(value for item in items for value in item["tags"]),
            "accessibility": _quality(items, "accessibility"),
            "performance": _quality(items, "performance"),
            "usability": {
                "score": round(_weighted_mean(items, "usability"), 6),
                "notes": ["Aggregated from source-level observations; not a universal outcome claim."],
            },
            "conversion": {
                "score": round(_weighted_mean(items, "outcome_evidence"), 6),
                "notes": ["Outcome evidence is contextual and prevalence alone is not effectiveness."],
            },
            "contraindications": [
                "Do not use when project constraints or user evidence contradict the mechanism.",
            ],
            "failure_modes": [
                "Copying a source implementation instead of adapting the principle.",
                "Treating recurrence as proof of effectiveness.",
            ],
            "evidence": {
                "observation_ids": _unique(item["id"] for item in items),
                "independent_source_groups": scores.independent_groups,
                "positive": _unique(positive),
                "negative": _unique(negative),
                "contradictory": _unique(contradictory),
                "provenance": _provenance(items),
            },
            "scores": {
                "formula_version": FORMULA_VERSION,
                "evidence_confidence": scores.evidence_confidence,
                "recommendation_score": scores.recommendation_score,
                "confidence_level": scores.final,
                "novelty": scores.novelty,
                "explanation": scores.explanation,
                "classification": {
                    "candidate": scores.candidate,
                    "final": scores.final,
                    "human_approval_required": scores.approval_required,
                    "human_approval_recorded": scores.approval_recorded,
                },
            },
            "first_seen": observed_dates[0] if observed_dates else today,
            "last_observed": observed_dates[-1] if observed_dates else today,
            "last_evaluated": today,
            "reviewers": reviewers if scores.approval_recorded else [],
        }
        issues = validate_instance(pattern, schema_path, subject=f"pattern {pattern_id}")
        if issues:
            raise EcosystemError(issues[0].message)
        output = root / "design-intelligence" / "knowledge" / domain / f"{pattern_id}.yaml"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            yaml.safe_dump(pattern, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )
        outputs.append(output.relative_to(root).as_posix())
        classifications[scores.final] += 1

    return {
        "status": "pass",
        "observations": len(observations),
        "patterns": len(outputs),
        "outputs": outputs,
        "classifications": dict(sorted(classifications.items())),
        "established_approvals": sorted(approved),
    }
