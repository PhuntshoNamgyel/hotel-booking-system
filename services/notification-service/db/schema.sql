-- Notification Service tables. Safe to run more than once.

-- What the guest would be told, one row per event.
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  event_id   TEXT NOT NULL UNIQUE,
  booking_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_booking ON notifications (booking_id);

-- Every event this service has seen, used for the event timeline in the UI.
CREATE TABLE IF NOT EXISTS event_log (
  event_id    TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,
  booking_id  TEXT NOT NULL,
  payload     JSONB NOT NULL,
  occurred_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_log_booking ON event_log (booking_id);

-- Remembers which events were already handled (duplicate protection).
CREATE TABLE IF NOT EXISTS processed_events (
  event_id     TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);