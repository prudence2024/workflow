"""Integrated validation for Design Intelligence storage and provenance."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from jsonschema.exceptions import SchemaError

from .design_extraction import load_observations
from .io import load_yaml
from .knowledge import load_patterns
from .models import Issue
from .schema import load_schema, validate_instance

_SCHEMAS = (
    "ingestion-config.json",
    "source-manifest.json",
    "design-observation.json",
    "knowledge-approval.json",
    "knowledge-pattern.json",
)


def _manifest_paths(root: Path) -> list[Path]:
    base = root / "design-intelligence" / "manifests"
    return sorted(base.rglob("*.yaml")) if base.exists() else []


def validate_design_intelligence(root: Path) -> dict[str, Any]:
    root = root.resolve()
    issues: list[Issue] = []
    evidence: list[str] = []
    for name in _SCHEMAS:
        path = root / "ecosystem" / "schemas" / name
        try:
            load_schema(path.resolve())
            evidence.append(f"Valid schema: {path.relative_to(root).as_posix()}")
        except (OSError, SchemaError, Exception) as exc:
            issues.append(Issue("intelligence.schema.invalid", str(exc), path=str(path)))

    config_path = root / "design-intelligence" / "config" / "ingestion.yaml"
    try:
        config = load_yaml(config_path)
        issues.extend(
            validate_instance(
                config,
                root / "ecosystem" / "schemas" / "ingestion-config.json",
                subject="ingestion configuration",
            )
        )
    except Exception as exc:
        issues.append(Issue("intelligence.config.invalid", str(exc), path=str(config_path)))

    gitignore = root / ".gitignore"
    ignored = (
        "/design-intelligence/references/raw/"
        in gitignore.read_text(encoding="utf-8", errors="replace")
        if gitignore.is_file()
        else False
    )
    if not ignored:
        issues.append(
            Issue(
                "intelligence.raw.not_ignored",
                "Raw website archives must be excluded by .gitignore",
                path=str(gitignore),
            )
        )
    else:
        evidence.append("Raw website archive directory is Git-ignored")

    manifests: dict[tuple[str, str], dict[str, Any]] = {}
    manifest_schema = root / "ecosystem" / "schemas" / "source-manifest.json"
    for path in _manifest_paths(root):
        try:
            manifest = load_yaml(path)
            validation = validate_instance(manifest, manifest_schema, subject=f"source {path.name}")
            issues.extend(validation)
            if not validation:
                manifests[(manifest["source_id"], manifest["capture_id"])] = manifest
        except Exception as exc:
            issues.append(Issue("intelligence.manifest.invalid", str(exc), path=str(path)))

    observations, observation_issues = load_observations(root)
    issues.extend(
        Issue("intelligence.observation.invalid", message) for message in observation_issues
    )
    observation_ids: set[str] = set()
    observation_groups: dict[str, str] = {}
    for observation in observations:
        observation_ids.add(observation["id"])
        observation_groups[observation["id"]] = observation["independence_group"]
        manifest = manifests.get((observation["source_id"], observation["capture_id"]))
        if manifest is None:
            issues.append(
                Issue(
                    "intelligence.provenance.manifest_missing",
                    f"Observation {observation['id']} references an unavailable manifest",
                )
            )
            continue
        if observation["provenance"]["archive_hash"] != manifest["archive_hash"]:
            issues.append(
                Issue(
                    "intelligence.provenance.hash_mismatch",
                    f"Observation {observation['id']} archive hash does not match its manifest",
                )
            )

    patterns, pattern_issues = load_patterns(root)
    issues.extend(pattern_issues)
    for pattern in patterns:
        missing = set(pattern["evidence"]["observation_ids"]) - observation_ids
        if missing:
            issues.append(
                Issue(
                    "intelligence.pattern.observation_missing",
                    f"Pattern {pattern['id']} references missing observations: {sorted(missing)}",
                    path=pattern.get("_path"),
                )
            )
        groups = {
            observation_groups[item]
            for item in pattern["evidence"]["observation_ids"]
            if item in observation_groups
        }
        if groups and len(groups) != pattern["evidence"]["independent_source_groups"]:
            issues.append(
                Issue(
                    "intelligence.pattern.group_count",
                    f"Pattern {pattern['id']} independent-source count is inconsistent",
                    path=pattern.get("_path"),
                )
            )
        classification = pattern["scores"].get("classification")
        if (
            pattern["scores"]["confidence_level"] == "established"
            and (
                not classification
                or not classification.get("human_approval_recorded")
                or pattern["status"] != "approved"
            )
        ):
            issues.append(
                Issue(
                    "intelligence.pattern.unapproved_established",
                    f"Pattern {pattern['id']} is established without recorded approval",
                    path=pattern.get("_path"),
                )
            )

    status = "fail" if any(issue.severity == "error" for issue in issues) else "pass"
    return {
        "schema_version": 1,
        "framework": "design-intelligence",
        "status": status,
        "summary": {
            "manifests": len(manifests),
            "observations": len(observations),
            "patterns": len(patterns),
            "issues": len(issues),
        },
        "evidence": evidence,
        "issues": [issue.as_dict() for issue in issues],
    }
