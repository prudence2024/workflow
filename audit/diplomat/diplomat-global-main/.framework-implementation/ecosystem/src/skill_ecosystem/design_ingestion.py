"""Secure, non-executing ingestion for owner-approved website archives."""

from __future__ import annotations

import hashlib
import re
import shutil
import stat
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

import yaml

from .errors import EcosystemError
from .io import load_yaml
from .schema import validate_instance

_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_INSTRUCTION = re.compile(
    r"\b(ignore (?:all|any|the) (?:previous|prior) instructions|system prompt|"
    r"developer message|act as|you are chatgpt)\b",
    re.IGNORECASE,
)
_SECRET_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("private-key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("aws-access-key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("github-token", re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b")),
    ("generic-secret-assignment", re.compile(
        r"(?i)\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*['\"][^'\"\r\n]{12,}['\"]"
    )),
)


@dataclass(frozen=True)
class IngestionRequest:
    archive: Path
    source_id: str
    capture_id: str
    source: str
    captured_at: str
    permitted_use: str
    independence_group: str
    ingested_by: str
    source_quality: float = 0.5
    content_origin: str = "owner-supplied"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def _write_yaml(data: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        yaml.safe_dump(data, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )


def _load_policy(root: Path) -> dict[str, Any]:
    path = root / "design-intelligence" / "config" / "ingestion.yaml"
    policy = load_yaml(path)
    issues = validate_instance(
        policy,
        root / "ecosystem" / "schemas" / "ingestion-config.json",
        subject="ingestion configuration",
    )
    if issues:
        raise EcosystemError(issues[0].message)
    return policy


def _validate_request(request: IngestionRequest, policy: dict[str, Any]) -> None:
    for label, value in (
        ("source_id", request.source_id),
        ("capture_id", request.capture_id),
    ):
        if not _SLUG.fullmatch(value):
            raise EcosystemError(f"{label} must be a lowercase hyphenated slug")
    if request.archive.suffix.casefold() not in set(policy["archive_formats"]):
        raise EcosystemError("Only configured inert archive formats are accepted")
    if not request.archive.is_file():
        raise EcosystemError(f"Archive does not exist: {request.archive}")
    if not 0 <= request.source_quality <= 1:
        raise EcosystemError("source_quality must be between 0 and 1")
    if request.content_origin not in {"owner-supplied", "approved-external-reference"}:
        raise EcosystemError("Unsupported content_origin")


def _safe_member_path(name: str, max_depth: int) -> PurePosixPath:
    normalized = name.replace("\\", "/")
    if "\x00" in normalized:
        raise EcosystemError("Archive entry contains a null byte")
    path = PurePosixPath(normalized)
    if path.is_absolute() or ".." in path.parts:
        raise EcosystemError(f"Archive path traversal rejected: {name}")
    if path.parts and ":" in path.parts[0]:
        raise EcosystemError(f"Archive drive path rejected: {name}")
    if len(path.parts) > max_depth:
        raise EcosystemError(f"Archive path exceeds configured depth: {name}")
    return path


def _is_symlink(info: zipfile.ZipInfo) -> bool:
    mode = info.external_attr >> 16
    return stat.S_ISLNK(mode)


def _scan_text(
    text: str,
    *,
    member: str,
    secrets: set[str],
    personal: set[str],
    instructions: set[str],
) -> None:
    for label, pattern in _SECRET_PATTERNS:
        if pattern.search(text):
            secrets.add(f"{label}:{member}")
    if _EMAIL.search(text):
        personal.add(f"email-address:{member}")
    if _INSTRUCTION.search(text):
        instructions.add(f"embedded-instruction:{member}")


def ingest_zip(root: Path, request: IngestionRequest) -> dict[str, Any]:
    """Scan then extract a ZIP archive without executing any archive content."""
    root = root.resolve()
    policy = _load_policy(root)
    _validate_request(request, policy)
    limits = policy["limits"]
    allowed = set(policy["allowed_extensions"])
    text_extensions = set(policy["text_extensions"])
    blocked_names = {name.casefold() for name in policy["blocked_filenames"]}
    raw_target = (
        root
        / "design-intelligence"
        / "references"
        / "raw"
        / request.source_id
        / request.capture_id
    )
    manifest_path = (
        root
        / "design-intelligence"
        / "manifests"
        / request.source_id
        / f"{request.capture_id}.yaml"
    )
    if raw_target.exists() or manifest_path.exists():
        raise EcosystemError("Source capture already exists; ingestion is immutable")

    entries: list[tuple[zipfile.ZipInfo, PurePosixPath]] = []
    file_types: set[str] = set()
    blocked_files: list[str] = []
    secrets: set[str] = set()
    personal: set[str] = set()
    instructions: set[str] = set()
    total_bytes = 0
    archive_hash = _sha256(request.archive)

    try:
        archive = zipfile.ZipFile(request.archive)
    except (OSError, zipfile.BadZipFile) as exc:
        raise EcosystemError(f"Invalid ZIP archive: {exc}") from exc

    with archive:
        infos = [item for item in archive.infolist() if not item.is_dir()]
        if len(infos) > limits["max_files"]:
            raise EcosystemError("Archive file-count limit exceeded")
        for info in infos:
            path = _safe_member_path(info.filename, limits["max_path_depth"])
            if _is_symlink(info):
                raise EcosystemError(f"Archive symlink rejected: {info.filename}")
            if info.flag_bits & 0x1:
                raise EcosystemError(f"Encrypted archive entry rejected: {info.filename}")
            suffix = Path(path.name).suffix.casefold()
            if suffix not in allowed:
                raise EcosystemError(f"Disallowed archive file type: {info.filename}")
            if path.name.casefold() in blocked_names or path.name.casefold().startswith(".env"):
                blocked_files.append(path.as_posix())
            if info.file_size > limits["max_file_bytes"]:
                raise EcosystemError(f"Archive entry exceeds size limit: {info.filename}")
            ratio = info.file_size / max(info.compress_size, 1)
            if ratio > limits["max_compression_ratio"]:
                raise EcosystemError(f"Archive compression-ratio limit exceeded: {info.filename}")
            total_bytes += info.file_size
            if total_bytes > limits["max_total_uncompressed_bytes"]:
                raise EcosystemError("Archive total-size limit exceeded")
            entries.append((info, path))
            file_types.add(suffix)

            if suffix in text_extensions and info.file_size <= policy["secret_scan"]["max_text_scan_bytes"]:
                try:
                    text = archive.read(info).decode("utf-8", errors="replace")
                except (OSError, RuntimeError, zipfile.BadZipFile) as exc:
                    raise EcosystemError(f"Cannot safely scan {info.filename}: {exc}") from exc
                _scan_text(
                    text,
                    member=path.as_posix(),
                    secrets=secrets,
                    personal=personal,
                    instructions=instructions,
                )

        if blocked_files:
            raise EcosystemError(
                "Blocked sensitive filenames detected: " + ", ".join(sorted(blocked_files))
            )
        if secrets and policy["secret_scan"]["fail_closed"]:
            raise EcosystemError(
                "Potential secrets detected; archive was not ingested: "
                + ", ".join(sorted(secrets))
            )

        raw_target.parent.mkdir(parents=True, exist_ok=True)
        temp_root = Path(tempfile.mkdtemp(prefix=".ingest-", dir=raw_target.parent))
        try:
            for info, relative in entries:
                destination = temp_root.joinpath(*relative.parts)
                if temp_root.resolve() not in destination.resolve().parents:
                    raise EcosystemError(f"Resolved archive path escaped target: {info.filename}")
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info, "r") as source_handle, destination.open("xb") as target_handle:
                    shutil.copyfileobj(source_handle, target_handle, length=1024 * 1024)
            temp_root.replace(raw_target)
        except Exception:
            shutil.rmtree(temp_root, ignore_errors=True)
            raise

    redaction_status = "not_reviewed" if personal else "clear"
    manifest = {
        "schema_version": 1,
        "source_id": request.source_id,
        "capture_id": request.capture_id,
        "source": request.source,
        "captured_at": request.captured_at,
        "archive_hash": archive_hash,
        "inventory": {
            "files": len(entries),
            "bytes": total_bytes,
            "types": sorted(file_types),
        },
        "permitted_use": request.permitted_use,
        "redaction_status": redaction_status,
        "independence_group": request.independence_group,
        "source_quality": round(request.source_quality, 6),
        "ingestion": {
            "status": "accepted",
            "policy_version": 1,
            "raw_path": raw_target.relative_to(root).as_posix(),
            "executed_content": False,
        },
        "security_scan": {
            "path_traversal": 0,
            "symlinks": 0,
            "encrypted_entries": 0,
            "limit_violations": 0,
            "blocked_files": [],
            "secret_indicators": [],
            "personal_data_indicators": sorted(personal),
            "embedded_instruction_indicators": sorted(instructions),
        },
        "provenance": {
            "original_archive": request.archive.name,
            "ingested_at": _utc_now(),
            "ingested_by": request.ingested_by,
            "content_origin": request.content_origin,
        },
    }
    issues = validate_instance(
        manifest,
        root / "ecosystem" / "schemas" / "source-manifest.json",
        subject="source manifest",
    )
    if issues:
        shutil.rmtree(raw_target, ignore_errors=True)
        raise EcosystemError(issues[0].message)
    try:
        _write_yaml(manifest, manifest_path)
    except Exception:
        shutil.rmtree(raw_target, ignore_errors=True)
        raise
    return {
        "status": "accepted",
        "manifest": manifest_path.relative_to(root).as_posix(),
        "raw_path": raw_target.relative_to(root).as_posix(),
        "archive_hash": archive_hash,
        "files": len(entries),
        "bytes": total_bytes,
        "executed_content": False,
        "redaction_status": redaction_status,
        "warnings": sorted(personal | instructions),
    }
