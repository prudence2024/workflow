"""Complete Phase 7 integration validation."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .design_intelligence_validation import validate_design_intelligence
from .discovery import discover_skills
from .io import load_json
from .models import CheckResult, Issue
from .registry import build_registry
from .reporting import create_validation_report, validate_report
from .skill_learning_validation import validate_skill_learning
from .validation import (
    validate_document,
    validate_registry,
    validate_repository,
)

_FIRST_PARTY = {
    "design-toolkit",
    "visibility",
    "security",
    "session-security",
    "legal-business",
    "incident-response",
    "support-triage",
    "post-production",
}

_DOCUMENTS = (
    "docs/architecture/ecosystem.md",
    "docs/architecture/universal-skill-standard.md",
    "docs/architecture/shared-context-protocol.md",
    "docs/architecture/registry-validation-reporting.md",
    "docs/architecture/design-intelligence.md",
    "docs/architecture/design-intelligence-implementation.md",
    "docs/architecture/skill-learning-framework.md",
    "docs/architecture/skill-learning-implementation.md",
    "docs/developer-cli.md",
    "docs/phases/phase-5-design-intelligence.md",
    "docs/phases/phase-6-skill-learning.md",
    "docs/migrations/first-party-skills.md",
)


def _framework_result(name: str, result: dict[str, Any]) -> CheckResult:
    issues = [
        Issue(
            item.get("code", f"{name}.invalid"),
            item.get("message", "Framework validation issue"),
            item.get("severity", "error"),
            item.get("path"),
            item.get("details", {}),
        )
        for item in result.get("issues", [])
    ]
    return CheckResult(
        name,
        "pass" if result.get("status") == "pass" else "fail",
        issues,
        list(result.get("evidence", [])),
    )


def _registry_snapshot(root: Path) -> CheckResult:
    path = root / "ecosystem" / "registry" / "skills.json"
    if not path.is_file():
        return CheckResult(
            "registry-snapshot",
            "fail",
            [Issue("registry.snapshot.missing", "Generated registry snapshot is missing", path=str(path))],
        )
    existing = load_json(path)
    generated_at = existing.get("generated_at") if isinstance(existing, dict) else None
    expected = build_registry(root, generated_at=generated_at)
    result = validate_registry(existing, root)
    if existing != expected:
        result.issues.append(
            Issue("registry.snapshot.stale", "Generated registry differs from current discovery", path=str(path))
        )
        result.status = "fail"
    result.name = "registry-snapshot"
    if not result.issues:
        result.evidence.append("Registry snapshot is schema-valid and current")
    return result


def _skill_inventory(root: Path) -> CheckResult:
    skills = discover_skills(root)
    first_party = [skill for skill in skills if not skill.upstream]
    upstream = [skill for skill in skills if skill.upstream]
    issues: list[Issue] = []
    ids = {skill.id for skill in first_party}
    if ids != _FIRST_PARTY:
        issues.append(
            Issue(
                "integration.skills.inventory",
                f"Expected first-party IDs {_FIRST_PARTY}; found {ids}",
            )
        )
    for skill in first_party:
        if not skill.manifest:
            issues.append(Issue("integration.skill.manifest", f"{skill.id} has no manifest"))
            continue
        if skill.manifest.get("version") != "1.0.0" or skill.manifest.get("status") != "stable":
            issues.append(
                Issue(
                    "integration.skill.lifecycle",
                    f"{skill.id} is not stable at version 1.0.0",
                )
            )
    if len(upstream) != 6 or any(not skill.read_only for skill in upstream):
        issues.append(
            Issue(
                "integration.upstream.boundary",
                "Expected six read-only upstream .system skills",
            )
        )
    return CheckResult(
        "skill-inventory",
        "fail" if issues else "pass",
        issues,
        [
            f"First-party skills: {len(first_party)}",
            f"Read-only upstream skills: {len(upstream)}",
        ],
    )


def _documentation(root: Path) -> CheckResult:
    missing = [relative for relative in _DOCUMENTS if not (root / relative).is_file()]
    issues = [
        Issue("integration.documentation.missing", f"Required document is missing: {relative}", path=relative)
        for relative in missing
    ]
    return CheckResult(
        "documentation",
        "fail" if issues else "pass",
        issues,
        [f"Validated {len(_DOCUMENTS)} required architecture, CLI, phase, and migration documents"],
    )


def validate_integration(root: Path) -> dict[str, Any]:
    root = root.resolve()
    results = validate_repository(root, require_manifests=True)
    results.extend(
        [
            _registry_snapshot(root),
            _skill_inventory(root),
            validate_document(
                root / "tests" / "fixtures" / "context.yaml",
                root=root,
                schema_name="shared-context.json",
                check_name="shared-context-contract",
            ),
            _framework_result(
                "design-intelligence-framework",
                validate_design_intelligence(root),
            ),
            _framework_result(
                "skill-learning-framework",
                validate_skill_learning(root),
            ),
            _documentation(root),
        ]
    )
    report = create_validation_report(
        results,
        title="Complete repository integration validation",
        scope="phase-7",
    )
    report["checks_not_run"] = [
        "Live website ingestion and corpus calibration",
        "External research retrieval and current-source comparison",
        "Production provider, deployment, field metric, legal, incident, and support checks",
    ]
    report["approval_required"] = False
    report_issues = validate_report(report, root)
    if report_issues:
        report["summary"]["status"] = "fail"
        report["errors"].extend(issue.message for issue in report_issues)
    return report
