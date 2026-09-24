-- Cost Price on Products
-- NULL = unknown cost (not entered yet)
-- 0 = explicitly zero cost (free item, giveaway, etc.)
-- positive = actual cost price
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price numeric(12,2);

-- Cost Price Snapshot on Order Items (historical cost at time of sale)
-- NULL = cost was unknown at time of sale (historical orders before migration)
-- 0 = explicitly zero cost
-- positive = actual cost captured at time of order
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cost_price numeric(12,2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sku text;

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL DEFAULT 'miscellaneous',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  vendor text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Expense categories check (idempotent)
DO $$ BEGIN
  ALTER TABLE expenses ADD CONSTRAINT expenses_category_check
    CHECK (category IN ('rent','salaries','marketing','logistics','utilities','software','miscellaneous'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS for expenses (idempotent)
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Service role (admin functions use service role) can do everything (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role manages expenses' AND tablename = 'expenses') THEN
    CREATE POLICY "Service role manages expenses" ON expenses
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Anonymous/public cannot access expenses at all (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Block public expenses access' AND tablename = 'expenses') THEN
    CREATE POLICY "Block public expenses access" ON expenses
      FOR ALL USING (false);
  END IF;
END $$;

-- Indexes for date-range and category queries
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- Expense-specific permissions
INSERT INTO permissions (key, name, description) VALUES
  ('expenses.view', 'View Expenses', 'View expense records'),
  ('expenses.create', 'Create Expenses', 'Create new expense records'),
  ('expenses.edit', 'Edit Expenses', 'Edit existing expense records'),
  ('expenses.delete', 'Delete Expenses', 'Delete expense records')
ON CONFLICT (key) DO NOTHING;
