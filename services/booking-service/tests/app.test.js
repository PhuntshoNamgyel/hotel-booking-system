// Unit tests: the database is mocked, so no Postgres is needed.
jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));

const request = require('supertest');
const { pool } = require('../src/db');
const { createApp } = require('../src/app');

const app = createApp();

beforeEach(() => {
  pool.query.mockReset();
});

test('GET /health returns ok when the database answers', async () => {
  pool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: 'ok', service: 'booking-service' });
});

test('GET /health returns 503 when the database is down', async () => {
  pool.query.mockRejectedValueOnce(new Error('connection refused'));
  const res = await request(app).get('/health');
  expect(res.status).toBe(503);
  expect(res.body.status).toBe('error');
});

test('unknown route returns 404 with a JSON error', async () => {
  const res = await request(app).get('/nope');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'Not found' });
});
