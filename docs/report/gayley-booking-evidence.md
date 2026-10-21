# Booking Service: reliability evidence

Author: Gayley Choden (Booking and Reservation Service). Tests run on 2026-10-21 with RabbitMQ, PostgreSQL, the Hotel Service and the Booking Service running locally. Payment was stopped, and its events were sent with `npm run send` from `services/booking-service`.

Screenshots are in `docs/report/screenshots/` and start with `G`.

| Test | Steps | Expected | Actual | Pass or fail | Evidence file |
|---|---|---|---|---|---|
| Consumer unavailable | Create a booking (PENDING), stop the Booking Service (health check fails), send PaymentSucceeded | Message waits in `booking.q`, booking stays PENDING | `booking.q` Ready 1, booking `bc702181...` PENDING, `curl` health "Failed to connect" | Pass | G1-booking-stopped.png, G1b-booking-down-health.png, G2-booking-q-waiting.png, G3-still-pending.png |
| Consumer recovery | Start the Booking Service again | Waiting event processed, booking CONFIRMED, BookingConfirmed published, queue empty | Log shows Event received, BookingConfirmed published, Booking updated CONFIRMED, Event processed; database CONFIRMED; `booking.q` Ready 0 | Pass | G4-recovery-log.png, G5-recovered-db.png, G6-booking-q-empty.png |
| Processing error and dead letter queue | `npm run send -- PaymentSucceeded x --bad` (no bookingId) | 3 attempts 3 seconds apart, then message moved to `booking.dlq` | 3 `Handler failed` lines (`Missing fields: bookingId`) at 13:55:59, 13:56:02, 13:56:05, then `Giving up, sending to dead-letter queue`; `booking.dlq` Ready 1 (purged afterwards) | Pass | G7a-send-bad-event.png, G7-retry-log.png, G8-dead-letter-queue.png |
| Duplicate event | Create a booking, send PaymentSucceeded twice with `--seed=gayley-dup-1` | Same eventId twice; first confirms the booking, second ignored, only one BookingConfirmed | Both sends had eventId `075efdb6...`; first: BookingConfirmed published, Booking updated CONFIRMED; second: `Duplicate event ignored`, nothing published; eventId stored once in `processed_events` | Pass | G9a-same-event-twice.png, G9-duplicate-log.png, G10-duplicate-db.png |
| Broker unavailable on create | `docker compose stop rabbitmq`, restart Hotel and Booking (they retry the connection), POST /bookings | 503 `Message broker unavailable`, booking saved as FAILED with reason PUBLISH_FAILED | 503 `{"error":"Message broker unavailable"}`; booking `9b187670...` FAILED, PUBLISH_FAILED; after `docker compose start rabbitmq` both services reconnected | Pass | G11a-rabbitmq-stopped.png, G11b-booking-retrying.png, G11-publish-failed-503.png, G12-publish-failed-db.png |

Notes:

- When RabbitMQ stops, each service exits (shared messaging library). On restart, the REST API answers at once and the broker connection retries every 3 seconds for about a minute.
- A message is acknowledged only after the handler finishes, and `booking.q` is durable, so a stopped consumer loses nothing.
- Duplicates are blocked by `processOnce`: the eventId is stored in `processed_events` in the same transaction as the booking update.
