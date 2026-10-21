jest.mock('../src/messaging', () => ({
  processOnce: jest.fn(),
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const { processOnce } = require('../src/messaging');
const { createHandlers } = require('../src/handlers');

const client = { query: jest.fn() };
const { handleEvent } = createHandlers({ pool: {} });

const event = {
  eventId: 'evt-1',
  eventType: 'BookingConfirmed',
  occurredAt: '2026-10-21T10:00:00.000Z',
  correlationId: 'b-1',
  data: { bookingId: 'b-1', guestName: 'Tashi', checkIn: '2026-11-01', checkOut: '2026-11-03' },
};

beforeEach(() => {
  jest.clearAllMocks();
  client.query.mockResolvedValue({ rowCount: 1 });
  // Run the work function directly, as if the event was new.
  processOnce.mockImplementation(async (pool, ev, work) => ({ duplicate: false, result: await work(client) }));
});

test('stores an event log row and a notification', async () => {
  await handleEvent(event);
  expect(client.query).toHaveBeenCalledTimes(2);
  expect(client.query.mock.calls[0][0]).toContain('event_log');
  expect(client.query.mock.calls[0][1].slice(0, 3)).toEqual(['evt-1', 'BookingConfirmed', 'b-1']);
  expect(client.query.mock.calls[1][0]).toContain('notifications');
  expect(client.query.mock.calls[1][1]).toEqual([
    'evt-1',
    'b-1',
    'BookingConfirmed',
    'Booking confirmed',
    expect.stringContaining('Tashi'),
  ]);
});

test('a duplicate event stores nothing', async () => {
  processOnce.mockResolvedValue({ duplicate: true });
  await handleEvent(event);
  expect(client.query).not.toHaveBeenCalled();
});

test('an event without eventId is rejected', async () => {
  await expect(handleEvent({ eventType: 'BookingConfirmed', data: { bookingId: 'b-1' } })).rejects.toThrow('eventId');
});

test('an event without any bookingId is rejected', async () => {
  await expect(handleEvent({ eventId: 'evt-2', eventType: 'BookingConfirmed', data: {} })).rejects.toThrow('bookingId');
});

test('falls back to correlationId when data has no bookingId', async () => {
  await handleEvent({ eventId: 'evt-3', eventType: 'BookingConfirmed', correlationId: 'b-7', data: {} });
  expect(client.query.mock.calls[1][1][1]).toBe('b-7');
});

test('a database error makes the handler throw so the message is retried', async () => {
  client.query.mockRejectedValue(new Error('db down'));
  await expect(handleEvent(event)).rejects.toThrow('db down');
});