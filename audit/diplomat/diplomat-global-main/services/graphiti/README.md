# Diplomat Global — Graphiti Knowledge Graph Service

Isolated Python service for future AI knowledge/memory architecture.

## Status

- **Installation**: Foundation only — no production integration yet
- **Runtime**: BLOCKED — awaiting Neo4j and LLM provider credentials
- **Integration**: Future phase — after commerce/admin foundation is stable

## Requirements

- Python 3.10+
- Neo4j 5.26+ (or FalkorDB 1.1.2+)
- LLM provider key (OpenAI default, or Anthropic/etc.)

## Setup

```bash
cd services/graphiti
uv sync
cp .env.example .env  # Fill in actual values
```

## Smoke Test

```bash
python src/smoke_test.py
```

## Architecture

```
Diplomat TanStack App
    │ controlled server API
    ▼
Graphiti Service (this)
    │
    ▼
Neo4j / Graph DB
```

Graphiti is NOT used for:
- Authentication
- RBAC
- Payments
- Primary business data
- Customer data

It is intended as a future knowledge/memory layer for AI-powered features.

## Environment Variables

See `.env.example` for required configuration.
Never commit actual values.
