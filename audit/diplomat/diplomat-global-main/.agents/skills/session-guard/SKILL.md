---
name: session-guard
description: Audit and verify session timeout behavior, idle/expiry handling, cross-tab coordination, and authentication state management. Use when testing session security, timeout UX, or auth state consistency.
version: 1.0.0
source: Adapted from Prudence Codex session-security skill
---

# Session Guard

Audit session timeout, authentication state, and cross-tab behavior.

## Checks

### Session Timeout
- Idle timeout behavior
- Absolute timeout behavior
- Warning UX before expiry
- Extension mechanism
- Reauthentication flow

### Authentication State
- Clerk session lifecycle
- Server-side session verification
- Client/server auth agreement
- Stale session handling
- Expired session redirect

### Cross-Tab
- Logout isolation
- Session invalidation across tabs
- Concurrent session behavior
- Tab focus/blur effects

### Workflow
1. Inspect Clerk configuration
2. Trace session verification path
3. Test timeout behavior
4. Test cross-tab scenarios
5. Verify reauthentication flow
6. Check for session fixation risks

### Evidence Required
- CODE INSPECTION of session handling
- BROWSER RUNTIME for timeout behavior
- OWNER CONFIRMATION for deployed behavior

### Do Not
- Enable multi-session without evidence
- Modify Clerk architecture
- Weaken session security for UX
