"""Static, non-executing extraction of reusable design-pattern observations."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from .errors import EcosystemError
from .io import load_yaml
from .schema import validate_instance

EXTRACTOR_VERSION = "static-signals-v1"


@dataclass(frozen=True)
class PatternSignal:
    key: str
    domain: str
    name: str
    summary: str
    problem: str
    mechanism: str
    expressions: tuple[re.Pattern[str], ...]
    ux_goals: tuple[str, ...]
    contexts: tuple[str, ...]
    tags: tuple[str, ...]
    accessibility: str = "neutral"
    performance: str = "neutral"
    usability: float = 0.6
    outcome_evidence: float = 0.4
    novelty: float = 0.3


def _rx(*expressions: str) -> tuple[re.Pattern[str], ...]:
    return tuple(re.compile(value, re.IGNORECASE | re.MULTILINE) for value in expressions)


SIGNALS: tuple[PatternSignal, ...] = (
    PatternSignal(
        "semantic-primary-navigation",
        "navigation",
        "Semantic primary navigation",
        "A clearly identified navigation region exposes primary destinations.",
        "Users need a predictable way to understand and traverse primary destinations.",
        "A semantic navigation landmark groups descriptive destination links.",
        _rx(r"<nav\b", r"role\s*=\s*['\"]navigation['\"]"),
        ("efficient-navigation", "orientation"),
        ("web", "keyboard", "screen-reader"),
        ("navigation", "landmark", "semantic"),
        accessibility="supports",
        usability=0.8,
    ),
    PatternSignal(
        "responsive-grid-layout",
        "layouts",
        "Responsive grid layout",
        "Content is arranged with a grid that can adapt across available space.",
        "Dense or repeated content needs alignment without fixed page geometry.",
        "A grid layout defines adaptable tracks and bounded gaps.",
        _rx(r"display\s*:\s*grid\b", r"grid-template-(?:columns|areas)\s*:"),
        ("scanability", "responsive-composition"),
        ("web", "responsive"),
        ("layout", "grid", "responsive"),
        usability=0.7,
    ),
    PatternSignal(
        "flexible-linear-layout",
        "layouts",
        "Flexible linear layout",
        "Related elements share a flexible row or column layout.",
        "Controls or content groups need resilient alignment and wrapping.",
        "A flexible layout distributes and wraps items within one primary axis.",
        _rx(r"display\s*:\s*(?:inline-)?flex\b", r"flex-wrap\s*:"),
        ("responsive-composition",),
        ("web", "responsive"),
        ("layout", "flex"),
    ),
    PatternSignal(
        "responsive-breakpoint-adaptation",
        "responsive",
        "Responsive breakpoint adaptation",
        "Presentation changes at bounded viewport or capability conditions.",
        "A single composition may not remain usable across viewport and input conditions.",
        "Conditional style rules adapt layout or behavior at explicit capability boundaries.",
        _rx(r"@media\b", r"@container\b"),
        ("responsive-composition", "mobile-usability"),
        ("web", "mobile", "desktop"),
        ("responsive", "breakpoint", "container-query"),
        usability=0.75,
    ),
    PatternSignal(
        "reduced-motion-accommodation",
        "accessibility",
        "Reduced-motion accommodation",
        "Motion is reduced or removed when the user requests less animation.",
        "Animation can create discomfort or obscure interaction for motion-sensitive users.",
        "A user preference condition substitutes reduced or static presentation.",
        _rx(r"prefers-reduced-motion"),
        ("comfortable-interaction", "accessible-motion"),
        ("web", "motion-sensitive"),
        ("accessibility", "motion", "preference"),
        accessibility="supports",
        performance="supports",
        usability=0.85,
        outcome_evidence=0.6,
    ),
    PatternSignal(
        "css-keyframe-motion",
        "motion",
        "CSS keyframe motion",
        "A bounded visual property sequence communicates change or atmosphere.",
        "State change or hierarchy may benefit from carefully constrained motion.",
        "Declarative keyframes interpolate selected visual properties over time.",
        _rx(r"@keyframes\b", r"animation(?:-name)?\s*:"),
        ("state-communication", "visual-emphasis"),
        ("web", "motion"),
        ("motion", "animation", "keyframes"),
        accessibility="unknown",
        performance="neutral",
        usability=0.55,
        novelty=0.55,
    ),
    PatternSignal(
        "explicit-form-labeling",
        "accessibility",
        "Explicit form labeling",
        "Form controls expose a programmatic label or accessible name.",
        "Users need to understand each control regardless of visual or assistive modality.",
        "A label relationship or accessible-name attribute identifies the control.",
        _rx(r"<label\b", r"aria-label(?:ledby)?\s*="),
        ("form-completion", "accessible-input"),
        ("web", "forms", "screen-reader"),
        ("accessibility", "forms", "labels"),
        accessibility="supports",
        usability=0.85,
        outcome_evidence=0.6,
    ),
    PatternSignal(
        "below-fold-media-deferral",
        "performance",
        "Below-fold media deferral",
        "Non-critical media can be deferred until it approaches the viewport.",
        "Large non-critical media can delay more important content and consume bandwidth.",
        "Explicit lazy-loading hints defer eligible off-screen media.",
        _rx(r"loading\s*=\s*['\"]lazy['\"]"),
        ("fast-content-access",),
        ("web", "media", "mobile"),
        ("performance", "media", "lazy-loading"),
        performance="supports",
        usability=0.65,
        outcome_evidence=0.55,
    ),
    PatternSignal(
        "tokenized-color-system",
        "color",
        "Tokenized color system",
        "Named custom properties centralize repeated color roles.",
        "Repeated literal colors can drift and make themes difficult to maintain.",
        "Semantic custom properties represent reusable foreground, background, and accent roles.",
        _rx(r"--[a-z0-9-]*(?:color|surface|background|foreground|accent)[a-z0-9-]*\s*:"),
        ("design-consistency", "maintainability"),
        ("web", "design-system"),
        ("color", "tokens", "consistency"),
        usability=0.65,
    ),
    PatternSignal(
        "typographic-role-system",
        "typography",
        "Typographic role system",
        "Repeated typographic properties define recognizable content roles.",
        "Readers need consistent hierarchy and legible text across content types.",
        "Font-family, size, weight, and line-height rules establish reusable roles.",
        _rx(r"font-family\s*:", r"line-height\s*:"),
        ("readability", "visual-hierarchy"),
        ("web", "content"),
        ("typography", "hierarchy", "readability"),
        accessibility="neutral",
        usability=0.7,
    ),
)

_TEXT_SUFFIXES = {
    ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".json", ".svg",
    ".txt", ".md", ".xml", ".webmanifest",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_static_text(path: Path, max_bytes: int = 4 * 1024 * 1024) -> str:
    if path.stat().st_size > max_bytes:
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def _manifest_path(root: Path, source_id: str, capture_id: str) -> Path:
    return root / "design-intelligence" / "manifests" / source_id / f"{capture_id}.yaml"


def extract_observations(
    root: Path,
    *,
    source_id: str,
    capture_id: str,
    industries: Iterable[str] = (),
    contextual_relevance: float = 0.7,
    freshness: float = 1.0,
) -> dict[str, Any]:
    """Extract abstract observations from inert text; never execute archive content."""
    if not 0 <= contextual_relevance <= 1 or not 0 <= freshness <= 1:
        raise EcosystemError("contextual_relevance and freshness must be between 0 and 1")
    root = root.resolve()
    manifest_path = _manifest_path(root, source_id, capture_id)
    if not manifest_path.is_file():
        raise EcosystemError(f"Source manifest does not exist: {manifest_path}")
    manifest = load_yaml(manifest_path)
    if manifest.get("ingestion", {}).get("status") != "accepted":
        raise EcosystemError("Only accepted source captures may be extracted")
    if manifest.get("redaction_status") == "quarantined":
        raise EcosystemError("Quarantined source captures may not be extracted")
    raw_path = root / manifest["ingestion"]["raw_path"]
    if not raw_path.is_dir():
        raise EcosystemError(f"Raw source directory does not exist: {raw_path}")

    matches: dict[str, set[str]] = {signal.key: set() for signal in SIGNALS}
    for path in sorted(raw_path.rglob("*")):
        if not path.is_file() or path.suffix.casefold() not in _TEXT_SUFFIXES:
            continue
        text = _read_static_text(path)
        if not text:
            continue
        relative = path.relative_to(raw_path).as_posix()
        for signal in SIGNALS:
            if any(expression.search(text) for expression in signal.expressions):
                matches[signal.key].add(relative)

    observations: list[dict[str, Any]] = []
    extracted_at = _now()
    manifest_relative = manifest_path.relative_to(root).as_posix()
    for signal in SIGNALS:
        references = sorted(matches[signal.key])
        if not references:
            continue
        confidence = min(0.95, 0.55 + 0.08 * min(len(references), 5))
        observation = {
            "schema_version": 1,
            "id": f"{source_id}-{capture_id}-{signal.key}",
            "source_id": source_id,
            "capture_id": capture_id,
            "independence_group": manifest["independence_group"],
            "pattern_key": signal.key,
            "domain": signal.domain,
            "name": signal.name,
            "summary": signal.summary,
            "problem": signal.problem,
            "mechanism": signal.mechanism,
            "evidence_kind": "positive",
            "evidence_references": references,
            "industries": sorted(set(industries)),
            "ux_goals": list(signal.ux_goals),
            "contexts": list(signal.contexts),
            "tags": list(signal.tags),
            "accessibility": signal.accessibility,
            "performance": signal.performance,
            "usability": signal.usability,
            "outcome_evidence": signal.outcome_evidence,
            "novelty": signal.novelty,
            "weights": {
                "source_quality": manifest["source_quality"],
                "extraction_confidence": round(confidence, 6),
                "independence_weight": 1.0,
                "freshness": round(freshness, 6),
                "contextual_relevance": round(contextual_relevance, 6),
            },
            "extracted_at": extracted_at,
            "extractor_version": EXTRACTOR_VERSION,
            "provenance": {
                "manifest": manifest_relative,
                "archive_hash": manifest["archive_hash"],
                "static_analysis_only": True,
                "copied_source_code": False,
            },
        }
        issues = validate_instance(
            observation,
            root / "ecosystem" / "schemas" / "design-observation.json",
            subject=f"observation {observation['id']}",
        )
        if issues:
            raise EcosystemError(issues[0].message)
        observations.append(observation)

    output = root / "design-intelligence" / "observations" / source_id / f"{capture_id}.jsonl"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "".join(json.dumps(item, sort_keys=True, ensure_ascii=False) + "\n" for item in observations),
        encoding="utf-8",
    )
    return {
        "status": "pass",
        "source_id": source_id,
        "capture_id": capture_id,
        "observations": len(observations),
        "output": output.relative_to(root).as_posix(),
        "static_analysis_only": True,
        "executed_content": False,
        "copied_source_code": False,
    }


def load_observations(root: Path) -> tuple[list[dict[str, Any]], list[str]]:
    observation_root = root / "design-intelligence" / "observations"
    observations: list[dict[str, Any]] = []
    issues: list[str] = []
    if not observation_root.exists():
        return observations, issues
    schema_path = root / "ecosystem" / "schemas" / "design-observation.json"
    for path in sorted(observation_root.rglob("*.jsonl")):
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                issues.append(f"{path}:{line_number}: invalid JSON: {exc}")
                continue
            validation = validate_instance(
                value,
                schema_path,
                subject=f"observation {path.name}:{line_number}",
            )
            if validation:
                issues.extend(issue.message for issue in validation)
            else:
                observations.append(value)
    return observations, issues
