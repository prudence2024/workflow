---
name: database-integrity
description: Inspect database schema integrity, constraints, FK relationships, orphan risks, concurrency, schema drift.
version: 1.0.0
---

# Database Integrity

## Checks

### Constraints
- Unique constraints on critical fields (email, code, reference)
- FK relationships exist and are correct
- NOT NULL where required
- CHECK constraints for valid ranges
- Default values appropriate

### Orphan Risk
- order_items without orders
- Admin users without roles
- Reviews without products
- Transactions without orders

### Concurrency
- Coupon usage race condition protection
- Inventory decrement CAS
- Payment webhook idempotency (CAS)
- Order status transitions

### Schema Drift
- Code references match actual columns
- Migration files match deployed schema
- No stale column references
- Types match (uuid vs text vs numeric)

### Data Integrity
- No negative quantities
- No negative prices
- Totals match sum of components
- Timestamps consistent

## Evidence
- Schema inspection via Supabase
- Migration file review
- Code-to-schema field matching
- Constraint violation testing
