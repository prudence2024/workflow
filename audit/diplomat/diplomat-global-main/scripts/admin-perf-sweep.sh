#!/bin/bash
# Authenticated Admin perf sweep via playwright-cli live session (Owner state).
# Read-only: navigates + observes. Output: screenshots/admin-perf-live.txt
OUT="screenshots/admin-perf-live.txt"
: > "$OUT"
PROBE='(() => {
  const res = performance.getEntriesByType("resource");
  const nav = performance.getEntriesByType("navigation")[0];
  const nonStatic = res.filter(r => !/\\.(js|css|woff2?|png|svg|ico|webp)(\\?|$)/.test(r.name));
  const urls = nonStatic.map(r => r.name.replace(location.origin, ""));
  const counts = {};
  urls.forEach(u => counts[u] = (counts[u]||0)+1);
  const slow = nonStatic.slice().sort((a,b) => b.duration - a.duration).slice(0,4).map(r => ({u: r.name.replace(location.origin,"").slice(0,80), ms: Math.round(r.duration), kb: Math.round(r.transferSize/1024)}));
  return JSON.stringify({dcl: Math.round(nav?.domContentLoadedEventEnd||0), api: nonStatic.length, totalRes: res.length, dup: urls.length - new Set(urls).size, slow, h1: document.querySelector("h1")?.textContent?.slice(0,40) || null, tables: document.querySelectorAll("table").length, overflowX: document.body.scrollWidth > innerWidth});
})()'
for r in dashboard dashboard/analytics dashboard/products dashboard/inventory dashboard/orders dashboard/customers dashboard/transactions dashboard/payments dashboard/receipts dashboard/refunds dashboard/coupons dashboard/reviews dashboard/blog dashboard/pages dashboard/media dashboard/settings dashboard/notifications dashboard/test-data; do
  playwright-cli goto "http://localhost:8080/$r" >/dev/null 2>&1
  sleep 4
  echo "== /$r" >> "$OUT"
  playwright-cli eval "$PROBE" 2>/dev/null | sed -n '/### Result/,/Ran Playwright/p' | grep -v "###" >> "$OUT"
  echo "" >> "$OUT"
done
echo "SWEEP_DONE lines=$(wc -l < "$OUT")"
