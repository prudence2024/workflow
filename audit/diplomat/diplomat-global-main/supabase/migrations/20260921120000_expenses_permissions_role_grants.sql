-- ============================================================
-- Expenses RBAC repair — maps the EXISTING expenses.* permission keys to roles
-- Date: 2026-09-21 · PREPARED ONLY — NOT APPLIED (Owner approval required)
--
-- ROOT CAUSE (verified live 2026-09-21, read-only):
--   expenses.view / expenses.create / expenses.edit / expenses.delete already
--   exist in public.permissions (created by
--   20260829120000_cost_price_expenses_analytics.sql, with descriptions).
--   That migration never inserted any public.role_permissions rows for them:
--       permissions rows with key like 'expenses.%'            -> 4
--       role_permissions rows referencing those 4 permission ids -> 0
--   Consequence: no role can reach Expenses. The Owner account only appears to
--   work because the permission check short-circuits for role key 'owner';
--   every other account (Administrator included) is denied "expenses.view".
--
--   This is an APPLICATION RBAC gap. It is INDEPENDENT of — and does not fix —
--   the second blocker: service_role lacks table privileges on public.expenses
--   (see 20260918120000_expenses_service_role_grant.sql). Both must be applied
--   before Expenses works for a non-Owner role.
--
-- ROLE MATRIX (Owner policy, exactly as approved in the brief):
--   owner    -> expenses.view, expenses.create, expenses.edit, expenses.delete
--   admin    -> expenses.view, expenses.create, expenses.edit, expenses.delete
--               (roles.name = 'Administrator')
--   finance  -> expenses.view                                    (view-only)
--   all other roles (editor, sales_manager, sales_rep, support, viewer) -> none
--   -> 9 role_permissions rows total.
--
-- CODE THAT CONSUMES THESE KEYS (src/, so the matrix maps to real behaviour):
--   expenses.view   -> dashboard sidebar gate + adminListExpenses (list)
--   expenses.create -> adminCreateExpense
--   expenses.edit   -> adminUpdateExpense
--   expenses.delete -> adminDeleteExpense
--
-- PRECONDITION (verified live 2026-09-21, read-only):
--   roles: admin(Administrator), editor(Content Editor), finance(Finance),
--          owner(Owner), sales_manager, sales_rep, support, viewer
--   permissions: the 4 expenses.* keys above
--   role_permissions rows referencing any expenses.* key: 0 (of 109 total rows)
--   -> the rollback below therefore removes exactly the 9 rows added here and
--      returns the table to today's fail-closed state, with no side effects.
--
-- IDEMPOTENT: role_permissions is PRIMARY KEY (role_id, permission_id) and the
--   INSERT names that exact conflict target, so a re-run inserts 0 rows and
--   changes nothing. Only role_permissions LINKS are created — no row is
--   created, altered or duplicated in public.permissions.
--   NOTE: the PL/pgSQL variables are prefixed v_ because an unprefixed
--   `role_id` makes `ON CONFLICT (role_id, permission_id)` ambiguous between
--   the column and the variable (PostgreSQL raises "column reference is
--   ambiguous"). Verified by executing this file against a scratch cluster.
--
-- FAIL-CLOSED GUARD: this block deliberately diverges from the older silent
--   "IF role_id IS NOT NULL ... END IF" house pattern. If a role or permission
--   key cannot be resolved, or the post-condition count is not exactly 9, the
--   block RAISES and the statement rolls back — instead of reporting success
--   while silently granting nothing.
-- ============================================================

DO $$
DECLARE
  v_role_key text;
  v_perm_key text;
  v_role_id uuid;
  v_perm_id uuid;
  missing_keys text[] := ARRAY[]::text[];
  inserted_count integer := 0;
  granted_count integer;
BEGIN
  -- Owner + Administrator: full CRUD over the expense ledger.
  FOREACH v_role_key IN ARRAY ARRAY['owner', 'admin'] LOOP
    FOREACH v_perm_key IN ARRAY ARRAY[
      'expenses.view',
      'expenses.create',
      'expenses.edit',
      'expenses.delete'
    ] LOOP
      SELECT id INTO v_role_id FROM public.roles       WHERE key = v_role_key LIMIT 1;
      SELECT id INTO v_perm_id FROM public.permissions WHERE key = v_perm_key LIMIT 1;

      IF v_role_id IS NULL OR v_perm_id IS NULL THEN
        -- array_append (not `||`) so the resolution can never be read as
        -- array||array, which raises "malformed array literal" on a bare text
        -- literal. Both paths verified by executing this file.
        missing_keys := array_append(missing_keys, format('%s/%s', v_role_key, v_perm_key));
        CONTINUE;
      END IF;

      INSERT INTO public.role_permissions (role_id, permission_id)
      VALUES (v_role_id, v_perm_id)
      ON CONFLICT (role_id, permission_id) DO NOTHING;

      IF FOUND THEN
        inserted_count := inserted_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- Finance: view-only. One key, deliberately no mutation grant.
  SELECT id INTO v_role_id FROM public.roles       WHERE key = 'finance' LIMIT 1;
  SELECT id INTO v_perm_id FROM public.permissions WHERE key = 'expenses.view' LIMIT 1;

  IF v_role_id IS NULL OR v_perm_id IS NULL THEN
    missing_keys := array_append(missing_keys, format('%s/%s', 'finance', 'expenses.view'));
  ELSE
    INSERT INTO public.role_permissions (role_id, permission_id)
    VALUES (v_role_id, v_perm_id)
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    IF FOUND THEN
      inserted_count := inserted_count + 1;
    END IF;
  END IF;

  IF array_length(missing_keys, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'expenses RBAC aborted — unresolved role/permission key(s): %',
      array_to_string(missing_keys, ', ');
  END IF;

  -- Post-condition: exactly the 9 approved grants must now be present.
  SELECT count(*) INTO granted_count
    FROM public.role_permissions rp
    JOIN public.roles       r ON r.id = rp.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
   WHERE (r.key, p.key) IN (
     ('owner',   'expenses.view'),
     ('owner',   'expenses.create'),
     ('owner',   'expenses.edit'),
     ('owner',   'expenses.delete'),
     ('admin',   'expenses.view'),
     ('admin',   'expenses.create'),
     ('admin',   'expenses.edit'),
     ('admin',   'expenses.delete'),
     ('finance', 'expenses.view')
   );

  IF granted_count <> 9 THEN
    RAISE EXCEPTION
      'expenses RBAC post-condition failed: expected 9 grants, found %',
      granted_count;
  END IF;

  RAISE NOTICE 'expenses RBAC OK — 9 grant rows present (inserted % this run)',
    inserted_count;
END $$;

-- ============================================================
-- VERIFICATION (post-apply — must return 9 rows: owner x4, admin x4, finance x1)
--   select r.key, p.key from public.role_permissions rp
--     join public.roles r       on r.id = rp.role_id
--     join public.permissions p on p.id = rp.permission_id
--    where p.key in ('expenses.view','expenses.create','expenses.edit','expenses.delete')
--    order by 1, 2;
--
-- Re-run check (idempotency): running this file a second time must print
--   'expenses RBAC OK — 9 grant rows present (inserted 0 this run)'.
-- ============================================================

-- ============================================================
-- ROLLBACK (returns the grant table to today's state: 0 expenses.* links)
--   delete from public.role_permissions rp
--   using public.roles r, public.permissions p
--   where rp.role_id = r.id
--     and rp.permission_id = p.id
--     and r.key in ('owner', 'admin', 'finance')
--     and p.key in ('expenses.view','expenses.create','expenses.edit','expenses.delete');
-- ============================================================
