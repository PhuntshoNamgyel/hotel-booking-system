// Unit tests: the database is mocked, so no Postgres is needed.
jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));

const request = require('supertest');
const { pool } = require('../src/db');
const app = require('../src/app');

const sampleRoom = {
  id: 3,
  hotelId: 1,
  hotelName: 'Druk Heritage Hotel',
  roomType: 'Suite',
  pricePerNight: 200,
  totalUnits: 1,
  availableUnits: 1,
};

beforeEach(() => {
  pool.query.mockReset();
});

describe('GET /hotels/:id/rooms', () => {
  test('returns 400 for a bad hotel id', async () => {
    const res = await request(app).get('/hotels/abc/rooms');
    expect(res.status).toBe(400);
  });

  test('returns 400 when only one date is given', async () => {
    const res = await request(app).get('/hotels/1/rooms?checkIn=2026-11-01');
    expect(res.status).toBe(400);
  });

  test('returns 400 when checkOut is before checkIn', async () => {
    const res = await request(app).get('/hotels/1/rooms?checkIn=2026-11-05&checkOut=2026-11-03');
    expect(res.status).toBe(400);
  });

  test('returns 404 for an unknown hotel', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/hotels/99/rooms');
    expect(res.status).toBe(404);
  });

  test('returns the rooms with availability', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // hotel exists
    pool.query.mockResolvedValueOnce({ rows: [sampleRoom] }); // rooms
    const res = await request(app).get('/hotels/1/rooms?checkIn=2026-11-01&checkOut=2026-11-03');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].availableUnits).toBe(1);
    // The dates must be passed to the query as parameters.
    expect(pool.query.mock.calls[1][1]).toEqual([1, '2026-11-01', '2026-11-03']);
  });
});

describe('GET /rooms/:id', () => {
  test('returns 404 for an unknown room', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/rooms/99');
    expect(res.status).toBe(404);
  });

  test('returns the room', async () => {
    pool.query.mockResolvedValueOnce({ rows: [sampleRoom] });
    const res = await request(app).get('/rooms/3?checkIn=2026-11-01&checkOut=2026-11-03');
    expect(res.status).toBe(200);
    expect(res.body.roomType).toBe('Suite');
  });
});