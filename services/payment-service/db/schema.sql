CREATE TABLE IF NOT EXISTS payments (
  id         TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE,
  amount     NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  status     TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'REFUNDED')),
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processed_events (
  event_id     TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);