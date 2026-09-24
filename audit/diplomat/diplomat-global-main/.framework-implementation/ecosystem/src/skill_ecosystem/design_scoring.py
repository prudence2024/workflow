"""Reproducible confidence, recommendation, and classification scoring."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Iterable

FORMULA_VERSION = "weighted-independent-evidence-v1"
_QUALITY = {"supports": 1.0, "neutral": 0.7, "risk": 0.2, "unknown": 0.5}


@dataclass(frozen=True)
class PatternScores:
    evidence_confidence: float
    recommendation_score: float
    novelty: float
    candidate: str
    final: str
    approval_required: bool
    approval_recorded: bool
    independent_groups: int
    explanation: str


def clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def observation_weight(observation: dict[str, Any]) -> float:
    weights = observation["weights"]
    value = 1.0
    for key in (
        "source_quality",
        "extraction_confidence",
        "independence_weight",
        "freshness",
        "contextual_relevance",
    ):
        value *= float(weights[key])
    return clamp(value)


def wilson_lower_bound(success_weight: float, total_weight: float, z: float = 1.281551565545) -> float:
    """Return a conservative one-sided Wilson lower bound for weighted evidence."""
    if total_weight <= 0:
        return 0.0
    proportion = clamp(success_weight / total_weight)
    denominator = 1 + z * z / total_weight
    centre = proportion + z * z / (2 * total_weight)
    margin = z * math.sqrt(
        (proportion * (1 - proportion) + z * z / (4 * total_weight)) / total_weight
    )
    return clamp((centre - margin) / denominator)


def _representative_groups(
    observations: Iterable[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Count one strongest observation per independence group."""
    representatives: dict[str, dict[str, Any]] = {}
    for observation in observations:
        group = observation["independence_group"]
        current = representatives.get(group)
        if current is None or observation_weight(observation) > observation_weight(current):
            representatives[group] = observation
    return representatives


def _candidate_level(
    confidence: float,
    independent_groups: int,
    contradiction_ratio: float,
) -> str:
    if contradiction_ratio >= 0.5:
        return "discouraged"
    if confidence >= 0.80 and independent_groups >= 12:
        return "established"
    if confidence >= 0.65 and independent_groups >= 4:
        return "contextual"
    if confidence >= 0.45 and independent_groups >= 2:
        return "promising"
    return "experimental"


def score_pattern(
    observations: Iterable[dict[str, Any]],
    *,
    approved_established: bool = False,
) -> PatternScores:
    material = list(observations)
    groups = _representative_groups(material)
    group_values = list(groups.values())
    total_weight = sum(observation_weight(item) for item in group_values)
    positive_weight = sum(
        observation_weight(item)
        for item in group_values
        if item["evidence_kind"] == "positive"
    )
    contradictory_weight = sum(
        observation_weight(item)
        for item in group_values
        if item["evidence_kind"] in {"negative", "contradictory"}
    )
    confidence = wilson_lower_bound(positive_weight, total_weight)
    contradiction_ratio = contradictory_weight / total_weight if total_weight else 0.0

    def weighted_average(field: str, default: float) -> float:
        if not group_values or total_weight <= 0:
            return default
        return sum(
            float(item[field]) * observation_weight(item) for item in group_values
        ) / total_weight

    def rated_average(field: str) -> float:
        if not group_values or total_weight <= 0:
            return 0.5
        return sum(
            _QUALITY[item[field]] * observation_weight(item) for item in group_values
        ) / total_weight

    accessibility = rated_average("accessibility")
    performance = rated_average("performance")
    usability = weighted_average("usability", 0.5)
    outcome = weighted_average("outcome_evidence", 0.5)
    novelty = weighted_average("novelty", 0.5)
    recommendation = clamp(
        0.45 * confidence
        + 0.15 * accessibility
        + 0.15 * performance
        + 0.15 * usability
        + 0.10 * outcome
        - 0.35 * contradiction_ratio
    )

    candidate = _candidate_level(confidence, len(groups), contradiction_ratio)
    approval_required = candidate == "established"
    approval_recorded = approval_required and approved_established
    final = candidate
    if candidate == "established" and not approved_established:
        final = "contextual"

    explanation = (
        f"{len(groups)} independent group(s); weighted support {positive_weight:.4f}/"
        f"{total_weight:.4f}; Wilson lower bound {confidence:.4f}; contradiction "
        f"ratio {contradiction_ratio:.4f}; accessibility {accessibility:.4f}; "
        f"performance {performance:.4f}; usability {usability:.4f}; outcome "
        f"evidence {outcome:.4f}. Candidate {candidate}; final {final}"
        + (" after recorded human approval." if approval_recorded else ".")
    )
    return PatternScores(
        evidence_confidence=round(confidence, 6),
        recommendation_score=round(recommendation, 6),
        novelty=round(novelty, 6),
        candidate=candidate,
        final=final,
        approval_required=approval_required,
        approval_recorded=approval_recorded,
        independent_groups=len(groups),
        explanation=explanation,
    )
