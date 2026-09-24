"""
Smoke test: verify graphiti-core imports and basic setup.

Run with: uv run python src/smoke_test.py

This test does NOT require Neo4j or LLM credentials.
It only verifies that the package is installed and importable.
"""

import sys


def test_import():
    """Verify graphiti-core can be imported."""
    try:
        from graphiti_core import Graphiti
        print("[PASS] graphiti-core imported successfully")
        print(f"       Graphiti class: {Graphiti}")
        return True
    except ImportError as e:
        print(f"[FAIL] Failed to import graphiti-core: {e}")
        print("       Run: uv sync")
        return False


def test_neo4j_driver():
    """Verify neo4j driver is available (optional)."""
    try:
        from neo4j import AsyncGraphDatabase
        print("[PASS] neo4j driver available")
        return True
    except ImportError:
        print("[WARN] neo4j driver not installed (required for runtime)")
        return False


def main():
    print("=" * 50)
    print("Graphiti Smoke Test")
    print("=" * 50)

    results = []
    results.append(("graphiti-core import", test_import()))
    results.append(("neo4j driver", test_neo4j_driver()))

    print()
    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    print(f"Results: {passed}/{total} passed")

    if passed < total:
        print("\nSome checks failed. This is expected if dependencies are not yet installed.")
        print("Run: cd services/graphiti && uv sync")
        sys.exit(1)
    else:
        print("\nAll checks passed.")
        sys.exit(0)


if __name__ == "__main__":
    main()
