// Handler tests. processOnce, the logger and the database functions are fakes.
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('../src/messaging', () => ({
  processOnce: jest.fn(),
  createLogger: () => mockLogger,
}));
jest.mock('../src/bookings');

const { processOnce } = require('../src/messaging');
const bookings = require('../src/bookings');
const { createHandlers } = require('../src/handlers');

const client = {}; // stands in for the transaction client
const broker = { publish: jest.fn() };
const { handleEvent } = createHandlers({ pool: {}, broker });

// The booking row as our database would return it.
const booking = {
  id: 'b-1',
  roomId: 1,
  hotelId: 1,
  guestName: 'Gayley Choden',
  guestEmail: 'gayley@example.com',
  checkIn: '2026-11-10',
  checkOut: '2026-11-12',
  totalAmount: 160,
};

const event = (eventType, data) => ({ eventId: 'evt-1', eventType, correlationId: 'b-1', data });

beforeEach(() => {
  jest.clearAllMocks();
  broker.publish.mockResolvedValue({});
  // Run the work function directly, as if the event is new.
  processOnce.mockImplementation(async (pool, evt, work) => ({ duplicate: false, result: await work(client) }));
});

test('PaymentSucceeded confirms the booking and publishes BookingConfirmed', async () => {
  bookings.finishPendingBooking.mockResolvedValue({ ...booking, status: 'CONFIRMED' });

  await handleEvent(event('PaymentSucceeded', { bookingId: 'b-1', paymentId: 'p-1', amount: 160 }));

  expect(bookings.finishPendingBooking).toHaveBeenCalledWith('b-1', 'CONFIRMED', null, client);
  expect(broker.publish).toHaveBeenCalledWith(
    'BookingConfirmed',
    {
      bookingId: 'b-1',
      roomId: 1,
      hotelId: 1,
      guestName: 'Gayley Choden',
      guestEmail: 'gayley@example.com',
      checkIn: '2026-11-10',
      checkOut: '2026-11-12',
      totalAmount: 160,
    },
    { causedBy: 'evt-1' }
  );
});

test('PaymentFailed fails the booking and publishes BookingFailed', async () => {
  bookings.finishPendingBooking.mockResolvedValue({ ...booking, status: 'FAILED', failureReason: 'PAYMENT_DECLINED' });

  await handleEvent(event('PaymentFailed', { bookingId: 'b-1', reason: 'PAYMENT_DECLINED' }));

  expect(bookings.finishPendingBooking).toHaveBeenCalledWith('b-1', 'FAILED', 'PAYMENT_DECLINED', client);
  expect(broker.publish).toHaveBeenCalledWith(
    'BookingFailed',
    {
      bookingId: 'b-1',
      roomId: 1,
      guestName: 'Gayley Choden',
      guestEmail: 'gayley@example.com',
      reason: 'PAYMENT_DECLINED',
    },
    { causedBy: 'evt-1' }
  );
});

test('RoomReservationFailed fails the booking and publishes nothing', async () => {
  bookings.finishPendingBooking.mockResolvedValue({ ...booking, status: 'FAILED', failureReason: 'ROOM_UNAVAILABLE' });

  await handleEvent(event('RoomReservationFailed', { bookingId: 'b-1', reason: 'ROOM_UNAVAILABLE' }));

  expect(bookings.finishPendingBooking).toHaveBeenCalledWith('b-1', 'FAILED', 'ROOM_UNAVAILABLE', client);
  expect(broker.publish).not.toHaveBeenCalled();
});

test('a duplicate event is ignored', async () => {
  processOnce.mockResolvedValue({ duplicate: true }); // eventId already in processed_events

  await handleEvent(event('PaymentSucceeded', { bookingId: 'b-1' }));

  expect(bookings.finishPendingBooking).not.toHaveBeenCalled();
  expect(broker.publish).not.toHaveBeenCalled();
  expect(mockLogger.warn).toHaveBeenCalledWith('Duplicate event ignored', expect.anything());
});

test('an unknown or finished booking changes nothing and publishes nothing', async () => {
  bookings.finishPendingBooking.mockResolvedValue(null); // no PENDING row matched

  await handleEvent(event('PaymentSucceeded', { bookingId: 'nope' }));

  expect(broker.publish).not.toHaveBeenCalled();
  expect(mockLogger.warn).toHaveBeenCalledWith('Booking not found or not PENDING, nothing changed', expect.anything());
});

test('a missing bookingId throws, so the library retries and dead-letters', async () => {
  await expect(handleEvent(event('PaymentSucceeded', { paymentId: 'p-1' }))).rejects.toThrow('Missing fields: bookingId');
  expect(processOnce).not.toHaveBeenCalled();
});

test('a failed publish throws, so the transaction rolls back and the event is retried', async () => {
  bookings.finishPendingBooking.mockResolvedValue({ ...booking, status: 'CONFIRMED' });
  broker.publish.mockRejectedValue(new Error('Channel closed'));

  await expect(handleEvent(event('PaymentSucceeded', { bookingId: 'b-1' }))).rejects.toThrow('Channel closed');
});

test('an unknown event type is ignored', async () => {
  await handleEvent(event('SomethingElse', { bookingId: 'b-1' }));
  expect(processOnce).not.toHaveBeenCalled();
});
