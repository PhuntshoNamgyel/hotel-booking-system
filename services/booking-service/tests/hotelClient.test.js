// The real fetch is replaced with a fake, so no Hotel Service is needed.
const { getRoom } = require('../src/hotelClient');

// Makes fetch answer with this status and JSON body.
const fakeFetch = (status, body) =>
  jest.spyOn(global, 'fetch').mockResolvedValue({ status, ok: status < 400, json: async () => body });

afterEach(() => jest.restoreAllMocks());

test('returns the room', async () => {
  fakeFetch(200, { hotelId: 1, pricePerNight: 80 });
  expect((await getRoom(1, '2026-11-10', '2026-11-12')).pricePerNight).toBe(80);
});

test('returns null when the room does not exist', async () => {
  fakeFetch(404, { error: 'Room not found' });
  expect(await getRoom(99, '2026-11-10', '2026-11-12')).toBeNull();
});

test('throws when the answer has no price', async () => {
  fakeFetch(200, { hotelId: 1 });
  await expect(getRoom(1, '2026-11-10', '2026-11-12')).rejects.toThrow('missing hotelId or pricePerNight');
});
