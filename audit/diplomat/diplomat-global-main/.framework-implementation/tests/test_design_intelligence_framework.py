from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

import pytest
import yaml

from skill_ecosystem.design_extraction import extract_observations, load_observations
from skill_ecosystem.design_ingestion import IngestionRequest, ingest_zip
from skill_ecosystem.design_intelligence_validation import validate_design_intelligence
from skill_ecosystem.design_normalization import normalize_knowledge
from skill_ecosystem.design_scoring import score_pattern
from skill_ecosystem.errors import EcosystemError
from skill_ecosystem.knowledge import KnowledgeQuery, load_patterns, query_patterns


def _root(tmp_path: Path, repository_root: Path) -> Path:
    for relative in (
        "design-intelligence/config/domains.yaml",
        "design-intelligence/config/ingestion.yaml",
        "ecosystem/schemas/domains-config.json",
        "ecosystem/schemas/ingestion-config.json",
        "ecosystem/schemas/source-manifest.json",
        "ecosystem/schemas/design-observation.json",
        "ecosystem/schemas/knowledge-approval.json",
        "ecosystem/schemas/knowledge-pattern.json",
    ):
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(repository_root / relative, target)
    (tmp_path / ".gitignore").write_text(
        "/design-intelligence/references/raw/\n", encoding="utf-8"
    )
    return tmp_path


def _zip(path: Path, entries: dict[str, str]) -> Path:
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    return path


def _request(archive: Path, source: str = "source-one", capture: str = "capture-one"):
    return IngestionRequest(
        archive=archive,
        source_id=source,
        capture_id=capture,
        source="Owner-supplied reference",
        captured_at="2026-07-30T12:00:00Z",
        permitted_use="Extract reusable design principles; do not reproduce the site.",
        independence_group=source,
        ingested_by="test-reviewer",
        source_quality=0.9,
    )


def test_secure_ingestion_extracts_without_execution_and_records_provenance(
    tmp_path, repository_root
):
    root = _root(tmp_path, repository_root)
    archive = _zip(
        tmp_path / "site.zip",
        {
            "index.html": "<nav><a href='/'>Home</a></nav><script>window.SHOULD_NOT_RUN = true</script>",
            "styles.css": (
                ":root{--color-accent:#123456}"
                ".cards{display:grid;grid-template-columns:repeat(3,1fr)}"
                "@media(max-width:600px){.cards{display:flex}}"
                "@media(prefers-reduced-motion:reduce){*{animation:none}}"
            ),
        },
    )
    result = ingest_zip(root, _request(archive))
    assert result["executed_content"] is False
    assert result["status"] == "accepted"
    manifest = yaml.safe_load((root / result["manifest"]).read_text(encoding="utf-8"))
    assert manifest["ingestion"]["executed_content"] is False
    assert manifest["archive_hash"].startswith("sha256:")

    extraction = extract_observations(
        root,
        source_id="source-one",
        capture_id="capture-one",
        industries=("saas",),
    )
    assert extraction["executed_content"] is False
    observations, issues = load_observations(root)
    assert not issues
    assert {item["pattern_key"] for item in observations} >= {
        "semantic-primary-navigation",
        "responsive-grid-layout",
        "reduced-motion-accommodation",
    }
    assert all(item["provenance"]["copied_source_code"] is False for item in observations)


def test_ingestion_rejects_path_traversal_before_writing(tmp_path, repository_root):
    root = _root(tmp_path, repository_root)
    archive = _zip(tmp_path / "traversal.zip", {"../escape.html": "<nav>bad</nav>"})
    with pytest.raises(EcosystemError, match="traversal"):
        ingest_zip(root, _request(archive))
    assert not (root / "design-intelligence/references/raw/source-one").exists()
    assert not (root / "design-intelligence/manifests/source-one").exists()


def test_ingestion_fails_closed_on_potential_secrets(tmp_path, repository_root):
    root = _root(tmp_path, repository_root)
    archive = _zip(
        tmp_path / "secret.zip",
        {"app.js": "const api_key = 'this-is-a-real-looking-secret-value';"},
    )
    with pytest.raises(EcosystemError, match="Potential secrets"):
        ingest_zip(root, _request(archive))
    assert not (root / "design-intelligence/references/raw/source-one").exists()


def test_single_source_stays_experimental_and_is_stored_by_domain(
    tmp_path, repository_root
):
    root = _root(tmp_path, repository_root)
    archive = _zip(
        tmp_path / "single.zip",
        {"index.html": "<nav><a href='/'>Home</a></nav>"},
    )
    ingest_zip(root, _request(archive))
    extract_observations(root, source_id="source-one", capture_id="capture-one")
    result = normalize_knowledge(root)
    assert result["classifications"] == {"experimental": 1}
    pattern_path = (
        root
        / "design-intelligence"
        / "knowledge"
        / "navigation"
        / "semantic-primary-navigation.yaml"
    )
    pattern = yaml.safe_load(pattern_path.read_text(encoding="utf-8"))
    assert pattern["scores"]["confidence_level"] == "experimental"
    assert pattern["evidence"]["independent_source_groups"] == 1


def _observation(group: str) -> dict:
    return {
        "independence_group": group,
        "evidence_kind": "positive",
        "accessibility": "supports",
        "performance": "supports",
        "usability": 0.95,
        "outcome_evidence": 0.9,
        "novelty": 0.2,
        "weights": {
            "source_quality": 0.98,
            "extraction_confidence": 0.98,
            "independence_weight": 1.0,
            "freshness": 1.0,
            "contextual_relevance": 0.98,
        },
    }


def test_established_candidate_requires_human_approval():
    observations = [_observation(f"independent-{index}") for index in range(40)]
    unapproved = score_pattern(observations)
    assert unapproved.candidate == "established"
    assert unapproved.final == "contextual"
    assert unapproved.approval_required is True
    assert unapproved.approval_recorded is False

    approved = score_pattern(observations, approved_established=True)
    assert approved.final == "established"
    assert approved.approval_recorded is True


def test_query_uses_domain_context_quality_and_scores(tmp_path, repository_root):
    root = _root(tmp_path, repository_root)
    archive = _zip(tmp_path / "query.zip", {"index.html": "<nav>Navigation</nav>"})
    ingest_zip(root, _request(archive))
    extract_observations(
        root,
        source_id="source-one",
        capture_id="capture-one",
        industries=("saas",),
    )
    normalize_knowledge(root)
    patterns, issues = load_patterns(root)
    assert not issues
    matches = query_patterns(
        patterns,
        KnowledgeQuery(
            domains=("navigation",),
            industries=("saas",),
            accessibility=("supports",),
            confidence_levels=("experimental",),
            min_recommendation_score=0.0,
        ),
    )
    assert [item["id"] for item in matches] == ["semantic-primary-navigation"]


def test_design_intelligence_validation_passes_for_empty_repository(
    tmp_path, repository_root
):
    root = _root(tmp_path, repository_root)
    result = validate_design_intelligence(root)
    assert result["status"] == "pass", json.dumps(result, indent=2)
