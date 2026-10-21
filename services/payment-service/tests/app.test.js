// Unit tests: the database is mocked, so no Postgres is needed.
jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));

const request = require('supertest');
const { pool } = require('../src/db');
const adminState = require('../src/adminState');
const app = require('../src/app');

const sample = {
  id: 'p-1',
  bookingId: 'b-1',
  amount: 100,
  status: 'SUCCESS',
  reason: null,
  createdAt: '2026-10-21T10:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z',
};

beforeEach(() => {
  pool.query.mockReset();
  adminState.setFailureMode(false);
  adminState.setTransientErrors(0);
});

test('GET /health returns ok when the database answers', async () => {
  pool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: 'ok', service: 'payment-service' });
});

test('GET /health returns 503 when the database is down', async () => {
  pool.query.mockRejectedValueOnce(new Error('connection refused'));
  const res = await request(app).get('/health');
  expect(res.status).toBe(503);
  expect(res.body.status).toBe('error');
});

test('unknown route returns a JSON 404', async () => {
  const res = await request(app).get('/nope');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'Not found' });
});

test('GET /payments returns the list without a filter', async () => {
  pool.query.mockResolvedValueOnce({ rows: [sample] });
  const res = await request(app).get('/payments');
  expect(res.status).toBe(200);
  expect(res.body).toEqual([sample]);
  expect(pool.query.mock.calls[0][1]).toBeUndefined();
});

test('GET /payments?bookingId= filters with a parameterised query', async () => {
  pool.query.mockResolvedValueOnce({ rows: [sample] });
  const res = await request(app).get('/payments?bookingId=b-1');
  expect(res.status).toBe(200);
  expect(pool.query.mock.calls[0][1]).toEqual(['b-1']);
});

test('GET /payments rejects a repeated bookingId with 400', async () => {
  const res = await request(app).get('/payments?bookingId=a&bookingId=b');
  expect(res.status).toBe(400);
  expect(res.body.error).toBeDefined();
});

test('GET /payments returns 500 with a JSON error when the database fails', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  pool.query.mockRejectedValueOnce(new Error('boom'));
  const res = await request(app).get('/payments');
  expect(res.status).toBe(500);
  expect(res.body).toEqual({ error: 'Internal server error' });
  spy.mockRestore();
});

test('GET /payments/:id returns one payment', async () => {
  pool.query.mockResolvedValueOnce({ rows: [sample] });
  const res = await request(app).get('/payments/p-1');
  expect(res.status).toBe(200);
  expect(res.body.id).toBe('p-1');
});

test('GET /payments/:id returns 404 when it does not exist', async () => {
  pool.query.mockResolvedValueOnce({ rows: [] });
  const res = await request(app).get('/payments/missing');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'Payment not found' });
});

test('failure mode is off by default and can be switched on and off', async () => {
  expect((await request(app).get('/admin/failure-mode')).body).toEqual({ enabled: false });

  const on = await request(app).post('/admin/failure-mode').send({ enabled: true });
  expect(on.status).toBe(200);
  expect(on.body).toEqual({ enabled: true });
  expect((await request(app).get('/admin/failure-mode')).body).toEqual({ enabled: true });

  await request(app).post('/admin/failure-mode').send({ enabled: false });
  expect((await request(app).get('/admin/failure-mode')).body).toEqual({ enabled: false });
});

test.each([{ enabled: 'yes' }, { enabled: 1 }, {}])('POST /admin/failure-mode rejects %p with 400', async (body) => {
  const res = await request(app).post('/admin/failure-mode').send(body);
  expect(res.status).toBe(400);
  expect(res.body.error).toBeDefined();
});

test('transient errors start at 0 and can be set', async () => {
  expect((await request(app).get('/admin/transient-errors')).body).toEqual({ remaining: 0 });

  const res = await request(app).post('/admin/transient-errors').send({ count: 2 });
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ remaining: 2 });
  expect((await request(app).get('/admin/transient-errors')).body).toEqual({ remaining: 2 });
});

test.each([{ count: -1 }, { count: 11 }, { count: 1.5 }, { count: '2' }, {}])(
  'POST /admin/transient-errors rejects %p with 400',
  async (body) => {
    const res = await request(app).post('/admin/transient-errors').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  }
);

test('a broken JSON body returns 400, not 500', async () => {
  const res = await request(app)
    .post('/admin/failure-mode')
    .set('Content-Type', 'application/json')
    .send('{"enabled": tru');
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'Invalid JSON body' });
});