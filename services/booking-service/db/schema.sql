-- Booking Service tables. Only the Booking Service reads or writes booking_db.

CREATE TABLE IF NOT EXISTS bookings (
  id             TEXT PRIMARY KEY,
  room_id        INTEGER NOT NULL,
  hotel_id       INTEGER NOT NULL,
  guest_name     TEXT NOT NULL,
  guest_email    TEXT NOT NULL,
  check_in       DATE NOT NULL,
  check_out      DATE NOT NULL,
  total_amount   NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
  status         TEXT NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED')),
  failure_reason TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (check_out > check_in)
);

-- Speeds up GET /bookings?guestEmail=...
CREATE INDEX IF NOT EXISTS bookings_guest_email_idx ON bookings (guest_email);

-- Every handled eventId is stored here, so a repeated event changes nothing.
CREATE TABLE IF NOT EXISTS processed_events (
  event_id     TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
