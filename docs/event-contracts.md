# Event Contracts

All services follow this file. Changes need agreement from all four members.

## Broker layout

| Item | Value |
|---|---|
| Exchange | `hotel.events` (topic, durable) |
| Dead-letter exchange | `hotel.dlx` (direct, durable) |
| Messages | JSON, persistent |

| Service | Queue | Routing keys bound |
|---|---|---|
| Hotel | `hotel.q` | `booking.created`, `booking.confirmed`, `booking.failed`, `booking.cancelled` |
| Payment | `payment.q` | `room.reserved`, `booking.cancelled` |
| Booking | `booking.q` | `room.reservation_failed`, `payment.succeeded`, `payment.failed` |
| Notification | `notification.q` | `#` (all events) |

Dead-letter queues: `hotel.dlq`, `payment.dlq`, `booking.dlq`, `notification.dlq`.

Each service has its own queue, so each gets its own copy of every event it is bound to.

## Event envelope

Every event has this shape. Only `data` differs per event.

```json
{
  "eventId": "6f1c2a5e-8b1d-4c53-9a35-0d1f2b7e9c11",
  "eventType": "BookingCreated",
  "occurredAt": "2026-10-20T09:30:00.000Z",
  "correlationId": "b-1001",
  "data": {}
}
```

| Field | Rule |
|---|---|
| `eventId` | New UUID per event. Used by consumers to ignore duplicates |
| `eventType` | Exact event name below |
| `occurredAt` | ISO 8601 UTC timestamp |
| `correlationId` | The `bookingId`, so one booking can be traced across services |

Conventions: field names are camelCase, dates are `YYYY-MM-DD`, money is a number, `bookingId` is a UUID string.

## Booking statuses

`PENDING`, `CONFIRMED`, `FAILED`, `CANCELLED`

## Events

### 1. BookingCreated

Purpose: a guest requested a room. A PENDING booking now exists.
Publisher: Booking. Consumers: Hotel, Notification.
Changes: Hotel tries to hold the room. Notification records "request received".

```json
{
  "bookingId": "b-1001",
  "roomId": 3,
  "hotelId": 1,
  "guestName": "Tashi Dorji",
  "guestEmail": "tashi@example.com",
  "checkIn": "2026-11-01",
  "checkOut": "2026-11-03",
  "totalAmount": 240.0
}
```

### 2. RoomReserved

Purpose: the room is held for the booking.
Publisher: Hotel. Consumers: Payment, Notification.
Changes: Hotel reservation is `HELD`. Payment creates and processes the payment.

```json
{
  "bookingId": "b-1001",
  "roomId": 3,
  "hotelId": 1,
  "guestName": "Tashi Dorji",
  "guestEmail": "tashi@example.com",
  "checkIn": "2026-11-01",
  "checkOut": "2026-11-03",
  "totalAmount": 240.0
}
```

### 3. RoomReservationFailed

Purpose: no room was available for those dates.
Publisher: Hotel. Consumers: Booking, Notification.
Changes: Booking becomes `FAILED`. Notification records the failure.

```json
{
  "bookingId": "b-1001",
  "roomId": 3,
  "guestName": "Tashi Dorji",
  "guestEmail": "tashi@example.com",
  "reason": "ROOM_UNAVAILABLE"
}
```

### 4. PaymentSucceeded

Purpose: the simulated payment was accepted.
Publisher: Payment. Consumers: Booking, Notification.
Changes: Payment is `SUCCESS`. Booking becomes `CONFIRMED`.

```json
{
  "bookingId": "b-1001",
  "paymentId": "p-2001",
  "amount": 240.0,
  "guestName": "Tashi Dorji",
  "guestEmail": "tashi@example.com"
}
```

### 5. PaymentFailed

Purpose: the simulated payment was declined.
Publisher: Payment. Consumers: Booking, Notification.
Changes: Payment is `FAILED`. Booking becomes `FAILED`.

```json
{
  "bookingId": "b-1001",
  "paymentId": "p-2001",
  "amount": 240.0,
  "guestName": "Tashi Dorji",
  "guestEmail": "tashi@example.com",
  "reason": "PAYMENT_DECLINED"
}
```

### 6. BookingConfirmed

Purpose: the booking is complete.
Publisher: Booking. Consumers: Hotel, Notification.
Changes: Hotel reservation becomes `CONFIRMED`. Notification sends a confirmation.

```json
{
  "bookingId": "b-1001",
  "roomId": 3,
  "hotelId": 1,
  "guestName": "Tashi Dorji",
  "guestEmail": "tashi@example.com",
  "checkIn": "2026-11-01",
  "checkOut": "2026-11-03",
  "totalAmount": 240.0
}
```

### 7. BookingFailed

Purpose: the booking could not be completed.
Publisher: Booking. Consumers: Hotel, Notification.
Changes: Hotel releases the held room. Notification sends a failure message.

```json
{
  "bookingId": "b-1001",
  "roomId": 3,
  "guestName": "Tashi Dorji",
  "guestEmail": "tashi@example.com",
  "reason": "PAYMENT_DECLINED"
}
```

`reason` values: `ROOM_UNAVAILABLE`, `PAYMENT_DECLINED`.

### 8. BookingCancelled

Purpose: the guest cancelled a CONFIRMED booking. Only CONFIRMED bookings can be cancelled.
Publisher: Booking. Consumers: Hotel, Payment, Notification.
Changes: Hotel releases the room. Payment marks the payment `REFUNDED`. Notification records the cancellation.

```json
{
  "bookingId": "b-1001",
  "roomId": 3,
  "guestName": "Tashi Dorji",
  "guestEmail": "tashi@example.com"
}
```

## Event chain

```
BookingCreated -> RoomReserved -> PaymentSucceeded -> BookingConfirmed
                       |                 |
                       |                 +-> PaymentFailed -> BookingFailed (room released)
                       +-> RoomReservationFailed -> booking FAILED
```

## Rules for every consumer

1. Acknowledge a message only after the work is done.
2. Record the `eventId` in the service's own `processed_events` table in the same transaction as the business change. If the id already exists, skip the message.
3. After 3 failed attempts, send the message to the service's dead-letter queue.
4. Never read or write another service's database.
5. Log every event received and every event published, with `eventId` and `bookingId`.