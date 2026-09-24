"""Recommendation-only comparison of first-party skills with approved evidence."""

from __future__ import annotations

import hashlib
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import yaml

from .discovery import DiscoveredSkill, discover_skills
from .errors import EcosystemError
from .io import load_json, load_yaml
from .schema import validate_instance

GENERATOR_VERSION = "skill-learning-v1"
_AUTHORITY = {"primary": 0.95, "secondary": 0.70, "community": 0.45}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug_time(value: str) -> str:
    return "".join(character for character in value.casefold() if character.isalnum())[:20]


def _write_yaml(data: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")


def _write_json(data: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def _file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _tree_hash(paths: Iterable[Path], root: Path) -> str:
    digest = hashlib.sha256()
    files: list[Path] = []
    for base in paths:
        if base.is_file():
            files.append(base)
        elif base.is_dir():
            files.extend(
                path
                for path in base.rglob("*")
                if path.is_file() and "__pycache__" not in path.parts
            )
    for path in sorted(set(files), key=lambda item: item.relative_to(root).as_posix()):
        relative = path.relative_to(root).as_posix()
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return f"sha256:{digest.hexdigest()}"


def protected_content_hash(root: Path, skills: list[DiscoveredSkill] | None = None) -> str:
    discovered = skills or discover_skills(root)
    protected = [skill.path for skill in discovered]
    return _tree_hash(protected, root)


def skill_revision_hash(skill: DiscoveredSkill) -> str:
    return _tree_hash([skill.path], skill.path.parent)


def _source_paths(root: Path) -> list[Path]:
    base = root / "research" / "sources"
    if not base.exists():
        return []
    return sorted(base.rglob("*.yaml")) + sorted(base.rglob("*.yml")) + sorted(base.rglob("*.json"))


def load_approved_sources(root: Path) -> tuple[list[dict[str, Any]], list[str]]:
    schema = root / "ecosystem" / "schemas" / "research-source.json"
    sources: list[dict[str, Any]] = []
    issues: list[str] = []
    for path in _source_paths(root):
        try:
            source = load_json(path) if path.suffix.casefold() == ".json" else load_yaml(path)
            validation = validate_instance(source, schema, subject=f"research source {path.name}")
            if validation:
                issues.extend(issue.message for issue in validation)
                continue
            sources.append(source)
        except Exception as exc:
            issues.append(f"{path}: {exc}")
    identifiers = [source["id"] for source in sources]
    if len(identifiers) != len(set(identifiers)):
        issues.append("Research source IDs must be unique")
    return sources, issues


def _skill_corpus(skill: DiscoveredSkill) -> str:
    text: list[str] = []
    for path in sorted(skill.path.rglob("*")):
        if not path.is_file() or path.suffix.casefold() not in {".md", ".yaml", ".yml", ".json", ".py"}:
            continue
        text.append(path.read_text(encoding="utf-8", errors="replace"))
    return "\n".join(text).casefold()


def _applies(claim: dict[str, Any], skill_id: str) -> bool:
    return "*" in claim["applies_to"] or skill_id in claim["applies_to"]


def _confidence(items: list[tuple[dict[str, Any], dict[str, Any]]]) -> tuple[float, str, int]:
    groups: dict[str, float] = {}
    for source, _claim in items:
        weight = _AUTHORITY[source["authority"]] * float(source["freshness"])
        groups[source["upstream_group"]] = max(groups.get(source["upstream_group"], 0.0), weight)
    strongest = max(groups.values(), default=0.0)
    score = min(0.98, strongest + 0.04 * max(0, len(groups) - 1))
    level = "high" if score >= 0.8 else ("medium" if score >= 0.55 else "low")
    return round(score, 6), level, len(groups)


def _recommendation(
    skill: DiscoveredSkill,
    capability: str,
    evidence_items: list[tuple[dict[str, Any], dict[str, Any]]],
    *,
    generated_at: str,
    problem_kind: str,
) -> dict[str, Any]:
    ordered = sorted(
        evidence_items,
        key=lambda item: (
            _AUTHORITY[item[0]["authority"]],
            item[0]["freshness"],
            item[0]["id"],
        ),
        reverse=True,
    )
    primary_source, primary_claim = ordered[0]
    score, level, group_count = _confidence(ordered)
    evidence = [
        {
            "source_id": source["id"],
            "claim_id": claim["id"],
            "canonical_url": source["canonical_url"],
            "content_hash": source["content_hash"],
            "authority": source["authority"],
            "upstream_group": source["upstream_group"],
        }
        for source, claim in ordered
    ]
    identity_material = json.dumps(
        {
            "skill": skill.id,
            "version": skill.manifest.get("version"),
            "revision": skill_revision_hash(skill),
            "capability": capability,
            "evidence": [(item["source_id"], item["claim_id"], item["content_hash"]) for item in evidence],
        },
        sort_keys=True,
    )
    suffix = hashlib.sha256(identity_material.encode("utf-8")).hexdigest()[:10]
    recommendation_id = f"{skill.id}-{capability}-{suffix}"
    problem = (
        f"Potential gap: the current {skill.id} revision does not expose all approved "
        f"markers for {capability}."
        if problem_kind == "gap"
        else f"Potential stale or conflicting guidance for {capability} is present in {skill.id}."
    )
    all_tradeoffs = sorted(
        {
            tradeoff
            for _source, claim in ordered
            for tradeoff in claim.get("trade_offs", [])
        }
    )
    alternatives = sorted(
        {
            alternative
            for _source, claim in ordered
            for alternative in claim["alternatives"]
        }
    )
    benefits = sorted(
        {benefit for _source, claim in ordered for benefit in claim["benefits"]}
    )
    return {
        "schema_version": 1,
        "id": recommendation_id,
        "affected_skill": {
            "id": skill.id,
            "version": skill.manifest.get("version", "unknown"),
            "revision_hash": skill_revision_hash(skill),
        },
        "problem": problem,
        "evidence": evidence,
        "proposed_change": primary_claim["suggested_change"],
        "alternatives": alternatives,
        "benefits": benefits,
        "expected_impact": "; ".join(benefits),
        "trade_offs": {
            "compatibility": "Preserve the existing trigger and declared interfaces unless separately approved.",
            "security": "Treat external guidance as untrusted evidence and validate any future implementation.",
            "maintenance": "The proposed capability may add review and version-maintenance work.",
            "context_cost": "Any added skill guidance must justify its prompt-context cost.",
            "other": all_tradeoffs,
        },
        "confidence": {
            "score": score,
            "level": level,
            "explanation": (
                f"Evidence deduplicated to {group_count} independent upstream group(s); "
                f"strongest authority/freshness contribution produced {score:.4f} confidence."
            ),
            "independent_source_groups": group_count,
        },
        "validation_plan": [
            "Review applicability against the exact affected skill revision.",
            "Obtain explicit human approval for this recommendation only.",
            "Implement in a separate change and preserve backward compatibility.",
            "Run strict skill validation, registry checks, and the full repository suite.",
        ],
        "status": "proposed",
        "human_decision": {"state": "pending", "decision_record": None},
        "approval_required": True,
        "implementation_reference": None,
        "generated_at": generated_at,
        "generator_version": GENERATOR_VERSION,
    }


def compare_skills(
    root: Path,
    *,
    skill_ids: Iterable[str] = (),
    generated_at: str | None = None,
) -> dict[str, Any]:
    root = root.resolve()
    generated_at = generated_at or _now()
    policy = load_yaml(root / "research" / "config" / "source-policy.yaml")
    policy_issues = validate_instance(
        policy,
        root / "ecosystem" / "schemas" / "research-policy.json",
        subject="research policy",
    )
    if policy_issues:
        raise EcosystemError(policy_issues[0].message)
    sources, source_issues = load_approved_sources(root)
    if source_issues:
        raise EcosystemError(f"Research sources have {len(source_issues)} validation issue(s)")
    if not sources:
        raise EcosystemError("No approved research sources are available")

    discovered = discover_skills(root)
    first_party = [skill for skill in discovered if not skill.upstream and skill.manifest]
    selected = set(skill_ids)
    if selected:
        unknown = selected - {skill.id for skill in first_party}
        if unknown:
            raise EcosystemError(f"Unknown first-party skill(s): {sorted(unknown)}")
        first_party = [skill for skill in first_party if skill.id in selected]
    protected_before = protected_content_hash(root, discovered)

    grouped: dict[tuple[str, str, str], list[tuple[dict[str, Any], dict[str, Any]]]] = defaultdict(list)
    aligned: list[str] = []
    warnings: list[str] = []
    corpora = {skill.id: _skill_corpus(skill) for skill in first_party}
    for source in sources:
        for claim in source["claims"]:
            for skill in first_party:
                if not _applies(claim, skill.id):
                    continue
                corpus = corpora[skill.id]
                missing = [marker for marker in claim["expected_markers"] if marker.casefold() not in corpus]
                obsolete = [marker for marker in claim["obsolete_markers"] if marker.casefold() in corpus]
                if not missing and not obsolete:
                    aligned.append(f"{skill.id}:{claim['capability']}:{claim['id']}")
                    continue
                kind = "conflict" if obsolete else "gap"
                grouped[(skill.id, claim["capability"], kind)].append((source, claim))

    recommendations: list[dict[str, Any]] = []
    gaps: list[str] = []
    conflicts: list[str] = []
    by_id = {skill.id: skill for skill in first_party}
    for (skill_id, capability, kind), items in sorted(grouped.items()):
        unique_groups = {source["upstream_group"] for source, _claim in items}
        only_community = all(source["authority"] == "community" for source, _claim in items)
        if only_community and len(unique_groups) < 2:
            warnings.append(
                f"Skipped {skill_id}:{capability}; community evidence lacks independent corroboration."
            )
            continue
        recommendation = _recommendation(
            by_id[skill_id],
            capability,
            items,
            generated_at=generated_at,
            problem_kind=kind,
        )
        validation = validate_instance(
            recommendation,
            root / "ecosystem" / "schemas" / "skill-recommendation.json",
            subject=f"recommendation {recommendation['id']}",
        )
        if validation:
            raise EcosystemError(validation[0].message)
        recommendations.append(recommendation)
        label = f"{skill_id}:{capability}"
        (conflicts if kind == "conflict" else gaps).append(label)

    writes: list[str] = []
    for recommendation in recommendations:
        output = root / "research" / "recommendations" / f"{recommendation['id']}.yaml"
        if not output.exists():
            _write_yaml(recommendation, output)
        writes.append(output.relative_to(root).as_posix())

    run_id = f"skill-learning-{_slug_time(generated_at)}-{hashlib.sha256(protected_before.encode()).hexdigest()[:8]}"
    report_path = root / "research" / "reports" / f"{run_id}.json"
    protected_after = protected_content_hash(root, discover_skills(root))
    if protected_before != protected_after:
        raise EcosystemError("Protected skill content changed during recommendation generation")
    report = {
        "schema_version": 1,
        "id": run_id,
        "generated_at": generated_at,
        "generator_version": GENERATOR_VERSION,
        "protected_revision_before": protected_before,
        "protected_revision_after": protected_after,
        "protected_content_unchanged": True,
        "approved_sources": sorted(source["id"] for source in sources),
        "skills_compared": sorted(skill.id for skill in first_party),
        "aligned_capabilities": sorted(set(aligned)),
        "gaps": gaps,
        "conflicts": conflicts,
        "recommendation_ids": [item["id"] for item in recommendations],
        "writes": writes + [report_path.relative_to(root).as_posix()],
        "warnings": warnings,
        "approval_required": True,
    }
    validation = validate_instance(
        report,
        root / "ecosystem" / "schemas" / "research-run.json",
        subject="research run",
    )
    if validation:
        raise EcosystemError(validation[0].message)
    _write_json(report, report_path)
    return report


def record_decision(
    root: Path,
    *,
    recommendation_id: str,
    decision: str,
    reviewer: str,
    reason: str,
    decided_at: str | None = None,
) -> dict[str, Any]:
    if decision not in {"approved", "rejected"}:
        raise EcosystemError("Decision must be approved or rejected")
    recommendation_path = root / "research" / "recommendations" / f"{recommendation_id}.yaml"
    if not recommendation_path.is_file():
        raise EcosystemError(f"Recommendation does not exist: {recommendation_id}")
    decision_path = root / "research" / "decisions" / f"{recommendation_id}.yaml"
    if decision_path.exists():
        raise EcosystemError("A decision already exists; decisions are immutable")
    record = {
        "schema_version": 1,
        "recommendation_id": recommendation_id,
        "decision": decision,
        "reviewer": reviewer,
        "decided_at": decided_at or _now(),
        "reason": reason,
        "scope": "this-recommendation-only",
    }
    issues = validate_instance(
        record,
        root / "ecosystem" / "schemas" / "recommendation-decision.json",
        subject="recommendation decision",
    )
    if issues:
        raise EcosystemError(issues[0].message)
    _write_yaml(record, decision_path)
    return {
        "status": "recorded",
        "decision": decision,
        "recommendation_id": recommendation_id,
        "decision_record": decision_path.relative_to(root).as_posix(),
        "skill_content_modified": False,
        "automatic_application_available": False,
    }
