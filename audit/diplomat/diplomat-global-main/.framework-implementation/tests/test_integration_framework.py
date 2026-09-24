from __future__ import annotations

from skill_ecosystem.integration_validation import validate_integration


def test_complete_repository_integration_passes(repository_root):
    report = validate_integration(repository_root)
    assert report["summary"]["status"] == "pass", report
    assert report["summary"]["failed"] == 0
    names = {item["name"] for item in report["validation_results"]}
    assert {
        "registry-snapshot",
        "skill-inventory",
        "shared-context-contract",
        "design-intelligence-framework",
        "skill-learning-framework",
        "documentation",
    } <= names


def test_all_first_party_skills_are_stable_and_upstream_is_read_only(repository_root):
    report = validate_integration(repository_root)
    inventory = next(
        item for item in report["validation_results"] if item["name"] == "skill-inventory"
    )
    assert inventory["status"] == "pass"
    assert "First-party skills: 8" in inventory["evidence"]
    assert "Read-only upstream skills: 6" in inventory["evidence"]
