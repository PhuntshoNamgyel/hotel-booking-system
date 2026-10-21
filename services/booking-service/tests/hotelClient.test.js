// The global fetch is replaced with a fake, so no Hotel Service is needed.
const { createHotelClient, HotelUnavailableError } = require('../src/hotelClient');

const client = createHotelClient({ baseUrl: 'http://hotel.test' });

afterEach(() => {
  jest.restoreAllMocks();
});

function fakeFetch(status, body) {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });
}

test('returns the room and calls the right URL', async () => {
  const spy = fakeFetch(200, { id: 1, hotelId: 1, pricePerNight: 80 });
  const room = await client.getRoom(1, '2026-11-10', '2026-11-12');
  expect(room.pricePerNight).toBe(80);
  expect(spy.mock.calls[0][0]).toBe('http://hotel.test/rooms/1?checkIn=2026-11-10&checkOut=2026-11-12');
});

test('returns null on 404', async () => {
  fakeFetch(404, { error: 'Room not found' });
  expect(await client.getRoom(99, '2026-11-10', '2026-11-12')).toBeNull();
});

test('throws HotelUnavailableError on a 500', async () => {
  fakeFetch(500, { error: 'boom' });
  await expect(client.getRoom(1, '2026-11-10', '2026-11-12')).rejects.toBeInstanceOf(HotelUnavailableError);
});

test('throws HotelUnavailableError on a network error', async () => {
  jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
  await expect(client.getRoom(1, '2026-11-10', '2026-11-12')).rejects.toBeInstanceOf(HotelUnavailableError);
});

test('throws HotelUnavailableError when the answer has no price', async () => {
  fakeFetch(200, { id: 1 });
  await expect(client.getRoom(1, '2026-11-10', '2026-11-12')).rejects.toBeInstanceOf(HotelUnavailableError);
});
