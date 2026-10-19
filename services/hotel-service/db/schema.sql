-- Hotel Service tables. Safe to run more than once.

CREATE TABLE IF NOT EXISTS hotels (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  city        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS rooms (
  id              SERIAL PRIMARY KEY,
  hotel_id        INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type       TEXT NOT NULL,
  price_per_night NUMERIC(10, 2) NOT NULL CHECK (price_per_night > 0),
  total_units     INTEGER NOT NULL CHECK (total_units > 0)
);

-- One row per booking that holds (or held) a room.
CREATE TABLE IF NOT EXISTS reservations (
  id         SERIAL PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE,
  room_id    INTEGER NOT NULL REFERENCES rooms(id),
  check_in   DATE NOT NULL,
  check_out  DATE NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('HELD', 'CONFIRMED', 'RELEASED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (check_out > check_in)
);

-- Remembers which events were already handled (duplicate protection).
CREATE TABLE IF NOT EXISTS processed_events (
  event_id     TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);