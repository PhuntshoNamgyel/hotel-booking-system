// Endpoint tests. The database, the queries and the Hotel Service are replaced with fakes (mocks),
// so these tests need no Postgres, no RabbitMQ and no other service.
jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/bookings');
jest.mock('../src/hotelClient');

const request = require('supertest');
const bookings = require('../src/bookings');
const hotelClient = require('../src/hotelClient');
const { createApp } = require('../src/app');

// A fake broker: records what would be published to RabbitMQ.
const broker = { publish: jest.fn() };
const app = createApp({ broker });

// A date n days from today, so the booking is always in the future.
const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const body = {
  roomId: 1,
  guestName: 'Gayley Choden',
  guestEmail: 'gayley@example.com',
  checkIn: daysFromNow(10),
  checkOut: daysFromNow(12),
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {}); // hide log lines during tests
});

test('POST /bookings creates a PENDING booking: 80 per night x 2 nights = 160', async () => {
  hotelClient.getRoom.mockResolvedValue({ hotelId: 1, pricePerNight: 80, availableUnits: 5 });
  bookings.insertBooking.mockImplementation(async (b) => ({ ...b, status: 'PENDING' }));

  const res = await request(app).post('/bookings').send(body);

  expect(res.status).toBe(201);
  expect(res.body.status).toBe('PENDING');
  expect(res.body.totalAmount).toBe(160);
  expect(res.body.hotelId).toBe(1);
});

test('POST /bookings publishes BookingCreated with the booking data', async () => {
  hotelClient.getRoom.mockResolvedValue({ hotelId: 1, pricePerNight: 80 });
  bookings.insertBooking.mockImplementation(async (b) => ({ ...b, status: 'PENDING' }));

  const res = await request(app).post('/bookings').send(body);

  expect(broker.publish).toHaveBeenCalledTimes(1);
  expect(broker.publish).toHaveBeenCalledWith('BookingCreated', {
    bookingId: res.body.id,
    roomId: 1,
    hotelId: 1,
    guestName: 'Gayley Choden',
    guestEmail: 'gayley@example.com',
    checkIn: body.checkIn,
    checkOut: body.checkOut,
    totalAmount: 160,
  });
});

test('POST /bookings marks the booking FAILED and returns 503 when publishing fails', async () => {
  hotelClient.getRoom.mockResolvedValue({ hotelId: 1, pricePerNight: 80 });
  bookings.insertBooking.mockImplementation(async (b) => ({ ...b, status: 'PENDING' }));
  broker.publish.mockRejectedValue(new Error('Channel closed'));
  jest.spyOn(console, 'error').mockImplementation(() => {});

  const res = await request(app).post('/bookings').send(body);

  expect(res.status).toBe(503);
  expect(res.body).toEqual({ error: 'Message broker unavailable' });
  expect(bookings.markPublishFailed).toHaveBeenCalledTimes(1);
});

test('POST /bookings still works when availableUnits is 0 (Hotel decides through events)', async () => {
  hotelClient.getRoom.mockResolvedValue({ hotelId: 1, pricePerNight: 80, availableUnits: 0 });
  bookings.insertBooking.mockImplementation(async (b) => ({ ...b, status: 'PENDING' }));
  const res = await request(app).post('/bookings').send(body);
  expect(res.status).toBe(201);
});

test('POST /bookings returns 400 for bad input and saves nothing', async () => {
  const res = await request(app).post('/bookings').send({ ...body, guestEmail: 'nope' });
  expect(res.status).toBe(400);
  expect(res.body.error).toContain('guestEmail must be a valid email address');
  expect(bookings.insertBooking).not.toHaveBeenCalled();
});

test('POST /bookings returns 400 for a broken JSON body', async () => {
  const res = await request(app).post('/bookings').set('Content-Type', 'application/json').send('{bad');
  expect(res.status).toBe(400);
});

test('POST /bookings returns 404 when the room does not exist', async () => {
  hotelClient.getRoom.mockResolvedValue(null);
  const res = await request(app).post('/bookings').send(body);
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'Room not found' });
});

test('POST /bookings returns 503 when the Hotel Service is down', async () => {
  hotelClient.getRoom.mockRejectedValue(new Error('fetch failed'));
  const res = await request(app).post('/bookings').send(body);
  expect(res.status).toBe(503);
  expect(res.body).toEqual({ error: 'Hotel service unavailable' });
  expect(bookings.insertBooking).not.toHaveBeenCalled();
});

test('GET /bookings returns the list and passes the email filter', async () => {
  bookings.listBookings.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]);
  const res = await request(app).get('/bookings?guestEmail=gayley@example.com');
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(2);
  expect(bookings.listBookings).toHaveBeenCalledWith('gayley@example.com');
});

test('GET /bookings returns 400 when guestEmail is repeated', async () => {
  const res = await request(app).get('/bookings?guestEmail=a@b.com&guestEmail=c@d.com');
  expect(res.status).toBe(400);
  expect(bookings.listBookings).not.toHaveBeenCalled();
});

test('GET /bookings/:id returns one booking', async () => {
  bookings.getBookingById.mockResolvedValue({ id: 'b1', status: 'PENDING' });
  const res = await request(app).get('/bookings/b1');
  expect(res.status).toBe(200);
  expect(res.body.id).toBe('b1');
});

test('GET /bookings/:id returns 404 for an unknown id', async () => {
  bookings.getBookingById.mockResolvedValue(null);
  const res = await request(app).get('/bookings/missing');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'Booking not found' });
});
