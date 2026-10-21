// The only REST call the Booking Service makes: ask the Hotel Service for a room's price.
// We never read hotel_db directly, because each service owns its own database.

// Returns the room ({ hotelId, pricePerNight, ... }), or null if the room does not exist.
// Throws an error if the Hotel Service is down, slow or broken.
async function getRoom(roomId, checkIn, checkOut) {
  const baseUrl = process.env.HOTEL_SERVICE_URL || 'http://localhost:3001';
  const url = `${baseUrl}/rooms/${roomId}?checkIn=${checkIn}&checkOut=${checkOut}`;

  // Give up after 5 seconds instead of making the guest wait forever.
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Hotel service answered ${res.status}`);
  return res.json();
}

module.exports = { getRoom };
