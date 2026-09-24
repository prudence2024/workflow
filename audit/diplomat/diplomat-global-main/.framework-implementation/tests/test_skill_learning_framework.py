from __future__ import annotations

import hashlib
import shutil
from pathlib import Path

import pytest
import yaml

from skill_ecosystem.errors import EcosystemError
from skill_ecosystem.skill_learning import (
    compare_skills,
    protected_content_hash,
    record_decision,
)
from skill_ecosystem.skill_learning_cli import build_parser
from skill_ecosystem.skill_learning_validation import validate_skill_learning


SCHEMAS = (
    "skill-manifest.json",
    "research-policy.json",
    "research-source.json",
    "skill-recommendation.json",
    "research-run.json",
    "recommendation-decision.json",
)


def _root(tmp_path: Path, repository_root: Path) -> Path:
    for name in SCHEMAS:
        target = tmp_path / "ecosystem" / "schemas" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(repository_root / "ecosystem" / "schemas" / name, target)
    policy = tmp_path / "research" / "config" / "source-policy.yaml"
    policy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(repository_root / "research" / "config" / "source-policy.yaml", policy)
    shutil.copytree(repository_root / "security", tmp_path / "security")
    return tmp_path


def _source(*, authority: str = "primary", approved: bool = True) -> dict:
    return {
        "schema_version": 1,
        "id": f"{authority}-source",
        "title": "Approved current engineering guidance",
        "canonical_url": "https://example.org/official/guidance",
        "publisher": "Example Standards Body",
        "source_type": "official-documentation" if authority == "primary" else "community-reference",
        "authority": authority,
        "approved": {
            "status": "approved" if approved else "pending",
            "by": "repository-owner",
            "at": "2026-07-30T12:00:00Z",
            "scope": "Compare the Security skill only.",
        },
        "version": {
            "kind": "page-revision",
            "value": "2026-07-30",
            "immutable_reference": "revision-123",
            "published_or_updated_at": "2026-07-29T12:00:00Z",
            "accessed_at": "2026-07-30T12:00:00Z",
        },
        "content_hash": "sha256:" + "a" * 64,
        "license": "Reference and paraphrase only.",
        "upstream_group": f"{authority}-upstream",
        "freshness": 0.95,
        "claims": [
            {
                "id": "control-expiry-review",
                "summary": "Security guidance should record time-bounded control review.",
                "capability": "control-expiry",
                "applies_to": ["security"],
                "expected_markers": ["control expiry review date"],
                "obsolete_markers": [],
                "applicability": "Relevant to continuously maintained security controls.",
                "suggested_change": "Consider documenting an explicit review date for time-sensitive controls.",
                "alternatives": ["Keep the current manual review process and document why it is sufficient."],
                "benefits": ["Makes stale control guidance easier to identify."],
                "trade_offs": ["Adds review metadata and maintenance work."],
            }
        ],
    }


def _write_source(root: Path, source: dict, name: str = "source.yaml") -> Path:
    path = root / "research" / "sources" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(source, sort_keys=False), encoding="utf-8")
    return path


def test_approved_sources_produce_recommendations_without_skill_mutation(
    tmp_path, repository_root
):
    root = _root(tmp_path, repository_root)
    _write_source(root, _source())
    before = protected_content_hash(root)
    report = compare_skills(
        root,
        skill_ids=("security",),
        generated_at="2026-07-30T15:00:00Z",
    )
    after = protected_content_hash(root)
    assert before == after
    assert report["protected_content_unchanged"] is True
    assert len(report["recommendation_ids"]) == 1
    recommendation = yaml.safe_load(
        (root / "research" / "recommendations" / f"{report['recommendation_ids'][0]}.yaml")
        .read_text(encoding="utf-8")
    )
    assert recommendation["status"] == "proposed"
    assert recommendation["approval_required"] is True
    assert recommendation["human_decision"]["state"] == "pending"
    assert recommendation["implementation_reference"] is None


def test_unapproved_source_is_rejected(tmp_path, repository_root):
    root = _root(tmp_path, repository_root)
    _write_source(root, _source(approved=False))
    with pytest.raises(EcosystemError, match="validation issue"):
        compare_skills(root, skill_ids=("security",))
    assert not (root / "research" / "recommendations").exists()


def test_uncorroborated_community_claim_does_not_create_recommendation(
    tmp_path, repository_root
):
    root = _root(tmp_path, repository_root)
    _write_source(root, _source(authority="community"))
    report = compare_skills(
        root,
        skill_ids=("security",),
        generated_at="2026-07-30T15:30:00Z",
    )
    assert report["recommendation_ids"] == []
    assert "lacks independent corroboration" in report["warnings"][0]


def test_human_decision_is_separate_and_does_not_apply_change(tmp_path, repository_root):
    root = _root(tmp_path, repository_root)
    _write_source(root, _source())
    report = compare_skills(
        root,
        skill_ids=("security",),
        generated_at="2026-07-30T16:00:00Z",
    )
    before = hashlib.sha256((root / "security" / "SKILL.md").read_bytes()).hexdigest()
    result = record_decision(
        root,
        recommendation_id=report["recommendation_ids"][0],
        decision="approved",
        reviewer="human-reviewer",
        reason="Approved for a separately scoped implementation proposal.",
        decided_at="2026-07-30T16:30:00Z",
    )
    after = hashlib.sha256((root / "security" / "SKILL.md").read_bytes()).hexdigest()
    assert before == after
    assert result["skill_content_modified"] is False
    assert result["automatic_application_available"] is False


def test_skill_learning_cli_exposes_no_apply_command():
    parser = build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(["apply"])


def test_skill_learning_validation_passes_with_no_sources(tmp_path, repository_root):
    root = _root(tmp_path, repository_root)
    result = validate_skill_learning(root)
    assert result["status"] == "pass", result
    assert "No automatic apply command is implemented" in result["evidence"]
