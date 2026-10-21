// Endpoint tests: the database functions and the hotel client are fakes.
jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/bookings', () => ({
  insertBooking: jest.fn(),
  getBookingById: jest.fn(),
  listBookings: jest.fn(),
}));

const request = require('supertest');
const bookings = require('../src/bookings');
const { createApp } = require('../src/app');
const { HotelUnavailableError } = require('../src/hotelClient');

// Dates relative to the real today, so they are always in the future.
function daysFromNow(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const body = {
  roomId: 1,
  guestName: 'Gayley Choden',
  guestEmail: 'gayley@example.com',
  checkIn: daysFromNow(10),
  checkOut: daysFromNow(12),
};

const hotelClient = { getRoom: jest.fn() };
const app = createApp({ hotelClient });

beforeEach(() => {
  jest.resetAllMocks();
  // Silence the JSON log lines during tests.
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /bookings', () => {
  test('creates a PENDING booking with price x nights', async () => {
    hotelClient.getRoom.mockResolvedValue({ id: 1, hotelId: 1, pricePerNight: 80, availableUnits: 5 });
    bookings.insertBooking.mockImplementation(async (b) => ({ ...b, status: 'PENDING', failureReason: null }));

    const res = await request(app).post('/bookings').send(body);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.totalAmount).toBe(160);
    expect(res.body.hotelId).toBe(1);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(hotelClient.getRoom).toHaveBeenCalledWith(1, body.checkIn, body.checkOut);
  });

  test('still creates the booking when availableUnits is 0 (Hotel decides through events)', async () => {
    hotelClient.getRoom.mockResolvedValue({ id: 1, hotelId: 1, pricePerNight: 80, availableUnits: 0 });
    bookings.insertBooking.mockImplementation(async (b) => ({ ...b, status: 'PENDING' }));
    const res = await request(app).post('/bookings').send(body);
    expect(res.status).toBe(201);
  });

  test('rounds the total to 2 decimals', async () => {
    hotelClient.getRoom.mockResolvedValue({ id: 1, hotelId: 1, pricePerNight: 33.335 });
    bookings.insertBooking.mockImplementation(async (b) => ({ ...b, status: 'PENDING' }));
    const res = await request(app).post('/bookings').send(body);
    expect(res.body.totalAmount).toBe(66.67);
  });

  test('returns 400 with the list of problems for bad input', async () => {
    const res = await request(app).post('/bookings').send({ ...body, guestEmail: 'nope', checkIn: '2020-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain('guestEmail must be a valid email address');
    expect(res.body.details).toContain('checkIn cannot be in the past');
    expect(hotelClient.getRoom).not.toHaveBeenCalled();
    expect(bookings.insertBooking).not.toHaveBeenCalled();
  });

  test('returns 400 for a body that is not JSON', async () => {
    const res = await request(app).post('/bookings').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Request body must be valid JSON');
  });

  test('returns 404 when the room does not exist', async () => {
    hotelClient.getRoom.mockResolvedValue(null);
    const res = await request(app).post('/bookings').send(body);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Room not found' });
    expect(bookings.insertBooking).not.toHaveBeenCalled();
  });

  test('returns 503 when the Hotel Service is down', async () => {
    hotelClient.getRoom.mockRejectedValue(new HotelUnavailableError('connect ECONNREFUSED'));
    const res = await request(app).post('/bookings').send(body);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'Hotel service unavailable' });
    expect(bookings.insertBooking).not.toHaveBeenCalled();
  });

  test('returns 500 when the database fails', async () => {
    hotelClient.getRoom.mockResolvedValue({ id: 1, hotelId: 1, pricePerNight: 80 });
    bookings.insertBooking.mockRejectedValue(new Error('db down'));
    const res = await request(app).post('/bookings').send(body);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});

describe('GET /bookings', () => {
  test('returns the list', async () => {
    bookings.listBookings.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]);
    const res = await request(app).get('/bookings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(bookings.listBookings).toHaveBeenCalledWith({ guestEmail: undefined });
  });

  test('passes the guestEmail filter', async () => {
    bookings.listBookings.mockResolvedValue([]);
    await request(app).get('/bookings?guestEmail=gayley@example.com');
    expect(bookings.listBookings).toHaveBeenCalledWith({ guestEmail: 'gayley@example.com' });
  });
});

describe('GET /bookings/:id', () => {
  test('returns one booking', async () => {
    bookings.getBookingById.mockResolvedValue({ id: 'b1', status: 'PENDING' });
    const res = await request(app).get('/bookings/b1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('b1');
  });

  test('returns 404 for an unknown id', async () => {
    bookings.getBookingById.mockResolvedValue(null);
    const res = await request(app).get('/bookings/missing');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Booking not found' });
  });
});
