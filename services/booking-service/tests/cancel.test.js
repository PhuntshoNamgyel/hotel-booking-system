// Cancel endpoint tests. The database connection, the queries and the broker are fakes.
// The fake client records every SQL command, so we can check BEGIN / COMMIT / ROLLBACK.
const mockClient = { query: jest.fn(), release: jest.fn() };
jest.mock('../src/db', () => ({ pool: { query: jest.fn(), connect: jest.fn(async () => mockClient) } }));
jest.mock('../src/bookings');
jest.mock('../src/hotelClient');

const request = require('supertest');
const bookings = require('../src/bookings');
const { createApp } = require('../src/app');

const broker = { publish: jest.fn() };
const app = createApp({ broker });

const confirmed = {
  id: 'b-1',
  roomId: 1,
  hotelId: 1,
  guestName: 'Gayley Choden',
  guestEmail: 'gayley@example.com',
  status: 'CANCELLED',
};

// The SQL commands sent on the fake client, for example ['BEGIN', 'COMMIT'].
const sqlSent = () => mockClient.query.mock.calls.map((call) => call[0]);

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockResolvedValue({});
  broker.publish.mockResolvedValue({});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

test('cancel returns 200, publishes BookingCancelled and commits', async () => {
  bookings.cancelConfirmedBooking.mockResolvedValue(confirmed);

  const res = await request(app).post('/bookings/b-1/cancel');

  expect(res.status).toBe(200);
  expect(res.body.status).toBe('CANCELLED');
  expect(broker.publish).toHaveBeenCalledWith('BookingCancelled', {
    bookingId: 'b-1',
    roomId: 1,
    guestName: 'Gayley Choden',
    guestEmail: 'gayley@example.com',
  });
  expect(sqlSent()).toEqual(['BEGIN', 'COMMIT']);
  expect(mockClient.release).toHaveBeenCalledTimes(1);
});

test('cancel returns 404 for an unknown booking', async () => {
  bookings.cancelConfirmedBooking.mockResolvedValue(null);
  bookings.getBookingById.mockResolvedValue(null);

  const res = await request(app).post('/bookings/nope/cancel');

  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'Booking not found' });
  expect(sqlSent()).toEqual(['BEGIN', 'ROLLBACK']);
  expect(broker.publish).not.toHaveBeenCalled();
});

test('cancel returns 409 for a booking that is not CONFIRMED', async () => {
  bookings.cancelConfirmedBooking.mockResolvedValue(null);
  bookings.getBookingById.mockResolvedValue({ id: 'b-1', status: 'PENDING' });

  const res = await request(app).post('/bookings/b-1/cancel');

  expect(res.status).toBe(409);
  expect(res.body).toEqual({ error: 'Only confirmed bookings can be cancelled' });
  expect(broker.publish).not.toHaveBeenCalled();
  expect(mockClient.release).toHaveBeenCalledTimes(1);
});

test('cancel returns 503 and rolls back when publishing fails', async () => {
  bookings.cancelConfirmedBooking.mockResolvedValue(confirmed);
  broker.publish.mockRejectedValue(new Error('Channel closed'));

  const res = await request(app).post('/bookings/b-1/cancel');

  expect(res.status).toBe(503);
  expect(res.body).toEqual({ error: 'Message broker unavailable' });
  expect(sqlSent()).toEqual(['BEGIN', 'ROLLBACK']); // no COMMIT, so the booking stays CONFIRMED
  expect(mockClient.release).toHaveBeenCalledTimes(1);
});
