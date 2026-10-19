// Runs "work" inside one database transaction, but only the first time an event id is seen.
// The event id and the business change commit together, so a repeated delivery
// cannot repeat the business effect.
//
// Each service needs this table in its own database:
//   CREATE TABLE processed_events (
//     event_id TEXT PRIMARY KEY,
//     processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
//   );
//
// Tip: if work() must publish a follow-up event, publish INSIDE work() (before commit)
// and pass { causedBy: event.eventId }. If the publish fails, everything rolls back and
// the retry starts clean. If the commit fails after a publish, the retry republishes
// the same event id and the next service ignores it.
async function processOnce(pool, event, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      'INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING',
      [event.eventId]
    );
    if (inserted.rowCount === 0) {
      await client.query('ROLLBACK');
      return { duplicate: true };
    }
    const result = await work(client);
    await client.query('COMMIT');
    return { duplicate: false, result };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { processOnce };