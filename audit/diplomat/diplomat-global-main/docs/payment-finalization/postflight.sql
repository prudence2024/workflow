-- READ ONLY, after separately approved migration/integration.
SELECT to_regprocedure('public.complete_verified_payment_v1(uuid,text,bigint,text,timestamptz)');
SELECT has_function_privilege('anon','public.complete_verified_payment_v1(uuid,text,bigint,text,timestamptz)','EXECUTE') AS anon_must_be_false,
has_function_privilege('authenticated','public.complete_verified_payment_v1(uuid,text,bigint,text,timestamptz)','EXECUTE') AS authenticated_must_be_false,
has_function_privilege('service_role','public.complete_verified_payment_v1(uuid,text,bigint,text,timestamptz)','EXECUTE') AS service_must_be_true;
SELECT count(*) AS mismatched_completions FROM public.payment_financial_completions c
JOIN public.orders o ON o.id=c.order_id JOIN public.payment_transactions t ON t.id=c.transaction_id
WHERE o.payment_reference IS DISTINCT FROM c.reference OR t.reference IS DISTINCT FROM c.reference
OR t.status <> 'successful' OR o.status NOT IN ('paid','processing','shipped','delivered');
SELECT count(*) AS forbidden_historical_completion FROM public.payment_financial_completions
WHERE reference='DG-MTLML9QG-WWA7';
