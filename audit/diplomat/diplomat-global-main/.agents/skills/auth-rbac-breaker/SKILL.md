---
name: auth-rbac-breaker
description: Test and verify Admin authentication and RBAC authorization. Break login flows, permission checks, role assignments. Adapted from Prudence Codex session-security.
version: 1.0.0
source: Prudence Codex session-security + Diplomat Global RBAC
---

# Auth / RBAC Breaker

## Architecture

Clerk identity → admin_users → active → role_id → roles → role_permissions → permissions

Never authorize using: admin_users.role (deprecated)

## Test Matrix

### Login States
- Unauthenticated → /admin/login shows SignIn
- Valid Owner → /admin/login redirects to /dashboard
- Valid Admin → /admin/login redirects to /dashboard
- Non-Admin Clerk user → /admin/unauthorized
- Inactive Admin → /admin/unauthorized
- Missing role_id → repair or deny
- Expired session → login page
- Direct /dashboard → proper redirect

### Authorization
- Sidebar visibility matches permissions
- Route access matches permissions
- Server functions enforce permissions
- Direct URL access denied without permission
- Background data fetches respect permissions
- Dashboard widgets conditional on permissions

### Role Management
- Owner can edit role permissions
- Role counts reflect actual DB state
- Permission changes affect all role members
- Owner root access cannot be stripped
- Audit logging for permission changes

### Idempotency
- Claim owner access is idempotent
- No duplicate admin_users rows
- No duplicate clerk_user_id

## Evidence Required
- Runtime browser test for login flow
- DB query for admin_users state
- Server function call for permission check
- Redirect chain observation
