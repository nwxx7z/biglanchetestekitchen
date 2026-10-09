CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  number INTEGER UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  printed BOOLEAN NOT NULL DEFAULT FALSE,
  print_requested BOOLEAN NOT NULL DEFAULT FALSE,
  print_claimed_by TEXT,
  print_claimed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cart JSONB NOT NULL,
  delivery JSONB NOT NULL,
  payment TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  total NUMERIC(10,2) NOT NULL DEFAULT 0
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_claimed_by TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_claimed_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_print_claim_idx ON orders (printed, print_claimed_until);
