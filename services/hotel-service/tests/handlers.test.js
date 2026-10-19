jest.mock('../src/messaging', () => ({
  processOnce: jest.fn(),
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../src/reservations');

const { processOnce } = require('../src/messaging');
const { reserveRoom, updateStatus } = require('../src/reservations');
const { createHandlers } = require('../src/handlers');

const client = {};
const broker = { publish: jest.fn() };
const { handleEvent } = createHandlers({ pool: {}, broker });

const created = {
  eventId: 'evt-1',
  eventType: 'BookingCreated',
  correlationId: 'b-1',
  data: {
    bookingId: 'b-1',
    roomId: 3,
    hotelId: 1,
    guestName: 'Tashi',
    guestEmail: 't@example.com',
    checkIn: '2026-11-01',
    checkOut: '2026-11-03',
    totalAmount: 240,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  broker.publish.mockResolvedValue({});
  // Run the work function directly, as if the event was new.
  processOnce.mockImplementation(async (pool, event, work) => ({ duplicate: false, result: await work(client) }));
});

test('BookingCreated publishes RoomReserved when the room is held', async () => {
  reserveRoom.mockResolvedValue({ ok: true });
  await handleEvent(created);
  expect(broker.publish).toHaveBeenCalledWith(
    'RoomReserved',
    expect.objectContaining({ bookingId: 'b-1', totalAmount: 240 }),
    { causedBy: 'evt-1' }
  );
});

test('BookingCreated publishes RoomReservationFailed when no room is free', async () => {
  reserveRoom.mockResolvedValue({ ok: false, reason: 'ROOM_UNAVAILABLE' });
  await handleEvent(created);
  expect(broker.publish).toHaveBeenCalledWith(
    'RoomReservationFailed',
    expect.objectContaining({ bookingId: 'b-1', reason: 'ROOM_UNAVAILABLE' }),
    { causedBy: 'evt-1' }
  );
});

test('a duplicate BookingCreated does nothing', async () => {
  processOnce.mockResolvedValue({ duplicate: true });
  await handleEvent(created);
  expect(reserveRoom).not.toHaveBeenCalled();
  expect(broker.publish).not.toHaveBeenCalled();
});

test('BookingCreated with missing fields throws', async () => {
  await expect(handleEvent({ ...created, data: { bookingId: 'b-1' } })).rejects.toThrow('Missing fields');
});

test('a publish failure makes the handler throw so the message is retried', async () => {
  reserveRoom.mockResolvedValue({ ok: true });
  broker.publish.mockRejectedValue(new Error('broker down'));
  await expect(handleEvent(created)).rejects.toThrow('broker down');
});

test('BookingConfirmed marks the reservation CONFIRMED', async () => {
  updateStatus.mockResolvedValue(1);
  await handleEvent({ eventId: 'evt-2', eventType: 'BookingConfirmed', correlationId: 'b-1', data: { bookingId: 'b-1' } });
  expect(updateStatus).toHaveBeenCalledWith(client, 'b-1', 'CONFIRMED', ['HELD']);
});

test('BookingFailed and BookingCancelled release the room', async () => {
  updateStatus.mockResolvedValue(1);
  await handleEvent({ eventId: 'evt-3', eventType: 'BookingFailed', correlationId: 'b-1', data: { bookingId: 'b-1' } });
  await handleEvent({ eventId: 'evt-4', eventType: 'BookingCancelled', correlationId: 'b-1', data: { bookingId: 'b-1' } });
  expect(updateStatus).toHaveBeenNthCalledWith(1, client, 'b-1', 'RELEASED', ['HELD', 'CONFIRMED']);
  expect(updateStatus).toHaveBeenNthCalledWith(2, client, 'b-1', 'RELEASED', ['HELD', 'CONFIRMED']);
});

test('an unknown event type is ignored', async () => {
  await handleEvent({ eventId: 'evt-5', eventType: 'Mystery', correlationId: 'x', data: {} });
  expect(processOnce).not.toHaveBeenCalled();
});