const { pool } = require('./db');

// One query serves both endpoints. $1 is the hotel id or room id (set by the WHERE below),
// $2 and $3 are check-in and check-out (null when no dates were requested).
// availableUnits = total units minus HELD/CONFIRMED reservations overlapping the dates.
// Two stays overlap when existing.check_in < requested.check_out AND existing.check_out > requested.check_in.
const SELECT_ROOMS = `
  SELECT r.id,
         r.hotel_id AS "hotelId",
         h.name AS "hotelName",
         r.room_type AS "roomType",
         r.price_per_night::float AS "pricePerNight",
         r.total_units AS "totalUnits",
         CASE WHEN $2::date IS NULL THEN NULL
              ELSE (r.total_units - x.booked)::int END AS "availableUnits"
    FROM rooms r
    JOIN hotels h ON h.id = r.hotel_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS booked
        FROM reservations res
       WHERE res.room_id = r.id
         AND res.status IN ('HELD', 'CONFIRMED')
         AND res.check_in < $3::date
         AND res.check_out > $2::date
    ) x ON TRUE
`;

async function hotelExists(hotelId) {
  const { rows } = await pool.query('SELECT 1 FROM hotels WHERE id = $1', [hotelId]);
  return rows.length > 0;
}

async function listRooms(hotelId, range) {
  const { rows } = await pool.query(`${SELECT_ROOMS} WHERE r.hotel_id = $1 ORDER BY r.id`, [
    hotelId,
    range ? range.checkIn : null,
    range ? range.checkOut : null,
  ]);
  return rows;
}

async function getRoom(roomId, range) {
  const { rows } = await pool.query(`${SELECT_ROOMS} WHERE r.id = $1`, [
    roomId,
    range ? range.checkIn : null,
    range ? range.checkOut : null,
  ]);
  return rows[0] || null;
}

module.exports = { hotelExists, listRooms, getRoom };