// Reads room details from the Hotel Service over REST.
// This is the only synchronous call the Booking Service makes. It never touches hotel_db.

class HotelUnavailableError extends Error {}

function createHotelClient({ baseUrl = process.env.HOTEL_SERVICE_URL || 'http://localhost:3001' } = {}) {
  // Returns { hotelId, pricePerNight, ... } or null when the room does not exist.
  // Throws HotelUnavailableError for timeouts, network errors and unexpected answers.
  async function getRoom(roomId, checkIn, checkOut) {
    const url = `${baseUrl}/rooms/${encodeURIComponent(roomId)}`
      + `?checkIn=${encodeURIComponent(checkIn)}&checkOut=${encodeURIComponent(checkOut)}`;

    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    } catch (err) {
      throw new HotelUnavailableError(`Hotel service request failed: ${err.message}`);
    }

    if (res.status === 404) return null;
    if (!res.ok) throw new HotelUnavailableError(`Hotel service answered ${res.status}`);

    const room = await res.json().catch(() => null);
    if (!room || !Number.isInteger(room.hotelId) || typeof room.pricePerNight !== 'number') {
      throw new HotelUnavailableError('Hotel service sent an unexpected room format');
    }
    return room;
  }

  return { getRoom };
}

module.exports = { createHotelClient, HotelUnavailableError };
