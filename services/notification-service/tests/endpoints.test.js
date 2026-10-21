// Unit tests: the database is mocked, so no Postgres is needed.
jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));

const request = require('supertest');
const { pool } = require('../src/db');
const app = require('../src/app');

beforeEach(() => {
  pool.query.mockReset();
});

describe('GET /notifications', () => {
  test('returns the list with the default limit', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 2, title: 'Booking confirmed' }] });
    const res = await request(app).get('/notifications');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(pool.query.mock.calls[0][1]).toEqual([null, 50]);
  });

  test('passes bookingId and limit to the query as parameters', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/notifications?bookingId=b-1&limit=5');
    expect(res.status).toBe(200);
    expect(pool.query.mock.calls[0][1]).toEqual(['b-1', 5]);
  });

  test.each(['0', '101', 'abc'])('rejects limit=%s', async (limit) => {
    const res = await request(app).get(`/notifications?limit=${limit}`);
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('rejects a bookingId that is too long', async () => {
    const res = await request(app).get(`/notifications?bookingId=${'x'.repeat(101)}`);
    expect(res.status).toBe(400);
  });

  test('returns 500 when the database fails', async () => {
    pool.query.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/notifications');
    expect(res.status).toBe(500);
  });
});

describe('GET /events', () => {
  test('requires a bookingId', async () => {
    const res = await request(app).get('/events');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });

  test('returns the timeline of one booking', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ eventType: 'BookingCreated' }, { eventType: 'RoomReserved' }],
    });
    const res = await request(app).get('/events?bookingId=b-1');
    expect(res.status).toBe(200);
    expect(res.body.map((e) => e.eventType)).toEqual(['BookingCreated', 'RoomReserved']);
    expect(pool.query.mock.calls[0][1]).toEqual(['b-1']);
  });
});