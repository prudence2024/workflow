-- Read-only: full live v1 definition + financial-table row exports (recovery checkpoint inputs).
SELECT pg_get_functiondef(p.oid) AS functiondef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'complete_verified_payment_v1';
