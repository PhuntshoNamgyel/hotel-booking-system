// Unit tests: the database is mocked, so no Postgres is needed.
jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));

const request = require('supertest');
const { pool } = require('../src/db');
const app = require('../src/app');

beforeEach(() => {
  pool.query.mockReset();
});

test('GET /health returns ok when the database answers', async () => {
  pool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
});

test('GET /health returns 503 when the database is down', async () => {
  pool.query.mockRejectedValueOnce(new Error('connection refused'));
  const res = await request(app).get('/health');
  expect(res.status).toBe(503);
});

test('GET /hotels returns the list from the database', async () => {
  pool.query.mockResolvedValueOnce({
    rows: [{ id: 1, name: 'Druk Heritage Hotel', city: 'Thimphu', description: '', fromPrice: 80 }],
  });
  const res = await request(app).get('/hotels');
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1);
  expect(res.body[0].name).toBe('Druk Heritage Hotel');
});

test('unknown route returns 404', async () => {
  const res = await request(app).get('/nope');
  expect(res.status).toBe(404);
});