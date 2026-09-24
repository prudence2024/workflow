---
name: ui-ux-breaker
description: Test UI/UX across states, devices, and edge cases. Loading, empty, error, offline, mobile, accessibility.
version: 1.0.0
source: Prudence Codex design-toolkit (adapted)
---

# UI / UX Breaker

Adapted from Prudence Codex design-toolkit.

## State Testing
- Loading: spinner/skeleton shown, no flash of empty content
- Empty: helpful message, clear CTA
- Error: truthful message, retry option
- Offline: detection, messaging, recovery
- Success: confirmation, next steps

## Responsive Testing
- Narrow mobile (320px)
- Normal mobile (375px)
- Landscape mobile
- Tablet (768px)
- Desktop (1024px)
- Wide desktop (1440px)
- 200% browser zoom

## Checks
- Horizontal overflow
- Overlapping elements
- Inaccessible buttons (too small, hidden)
- Off-screen modals
- Touch targets (min 44px)
- Broken navigation
- Long text truncation
- Long error messages
- Software keyboard open

## Accessibility
- Keyboard-only navigation
- Visible focus indicators
- Semantic buttons/links
- Modal focus trap + Escape
- Form labels associated
- Error messages associated with fields
- Alt text on images
- Zoom without breaking layout

## Error UX
- Differentiated: offline, network, server
- Truthful messaging (not generic "something went wrong")
- Try again actually retries
- Go home works
