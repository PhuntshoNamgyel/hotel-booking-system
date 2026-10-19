const { reserveRoom, updateStatus } = require('../src/reservations');

const request = { bookingId: 'b-1', roomId: 3, checkIn: '2026-11-01', checkOut: '2026-11-03' };

function fakeClient(...results) {
  const query = jest.fn();
  results.forEach((r) => query.mockResolvedValueOnce(r));
  return { query };
}

test('reserves a room when units are free', async () => {
  const client = fakeClient(
    { rows: [{ id: 3, total_units: 1 }] }, // lock room
    { rows: [] }, // no existing reservation
    { rows: [{ booked: 0 }] }, // overlap count
    { rowCount: 1 } // insert
  );
  const result = await reserveRoom(client, request);
  expect(result.ok).toBe(true);
  expect(client.query).toHaveBeenCalledTimes(4);
  expect(client.query.mock.calls[3][0]).toContain('INSERT INTO reservations');
});

test('rejects when every unit is already booked, and inserts nothing', async () => {
  const client = fakeClient(
    { rows: [{ id: 3, total_units: 1 }] },
    { rows: [] },
    { rows: [{ booked: 1 }] }
  );
  const result = await reserveRoom(client, request);
  expect(result).toEqual({ ok: false, reason: 'ROOM_UNAVAILABLE' });
  expect(client.query).toHaveBeenCalledTimes(3);
});

test('rejects an unknown room', async () => {
  const client = fakeClient({ rows: [] });
  const result = await reserveRoom(client, request);
  expect(result.ok).toBe(false);
});

test('does not reserve twice for the same booking', async () => {
  const client = fakeClient({ rows: [{ id: 3, total_units: 1 }] }, { rows: [{ status: 'HELD' }] });
  const result = await reserveRoom(client, request);
  expect(result.ok).toBe(true);
  expect(result.alreadyReserved).toBe(true);
  expect(client.query).toHaveBeenCalledTimes(2);
});

test('updateStatus returns the number of changed rows', async () => {
  const client = fakeClient({ rowCount: 1 });
  expect(await updateStatus(client, 'b-1', 'RELEASED', ['HELD', 'CONFIRMED'])).toBe(1);
  expect(client.query.mock.calls[0][1]).toEqual(['b-1', 'RELEASED', ['HELD', 'CONFIRMED']]);
});