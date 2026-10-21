const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NIGHTS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// True only for real calendar dates written as YYYY-MM-DD (rejects 2026-02-30).
function isRealDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Number of nights between two valid YYYY-MM-DD dates.
function countNights(checkIn, checkOut) {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / DAY_MS);
}

// Today's date in UTC as YYYY-MM-DD.
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

// Accepts 3 or "3". Returns the number, or null when it is not a positive whole number.
function parsePositiveInt(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value) && Number(value) > 0) return Number(value);
  return null;
}

// Checks the POST /bookings body.
// Returns { value } with cleaned fields, or { errors } with a list of messages.
// `today` can be passed in so tests do not depend on the real date.
function validateBookingInput(body, today = todayUtc()) {
  const input = body && typeof body === 'object' ? body : {};
  const errors = [];

  const roomId = parsePositiveInt(input.roomId);
  if (roomId === null) errors.push('roomId must be a positive integer');

  const guestName = typeof input.guestName === 'string' ? input.guestName.trim() : '';
  if (guestName.length < 2 || guestName.length > 100) {
    errors.push('guestName must be 2 to 100 characters');
  }

  const guestEmail = typeof input.guestEmail === 'string' ? input.guestEmail.trim() : '';
  if (!EMAIL_RE.test(guestEmail) || guestEmail.length > 254) {
    errors.push('guestEmail must be a valid email address');
  }

  const { checkIn, checkOut } = input;
  const datesValid = isRealDate(checkIn) && isRealDate(checkOut);
  if (!datesValid) {
    errors.push('checkIn and checkOut must be real dates in YYYY-MM-DD format');
  } else if (checkOut <= checkIn) {
    errors.push('checkOut must be after checkIn');
  } else {
    if (checkIn < today) errors.push('checkIn cannot be in the past');
    if (countNights(checkIn, checkOut) > MAX_NIGHTS) {
      errors.push(`Stay cannot be longer than ${MAX_NIGHTS} nights`);
    }
  }

  if (errors.length > 0) return { errors };
  return { value: { roomId, guestName, guestEmail, checkIn, checkOut } };
}

module.exports = { isRealDate, countNights, validateBookingInput, MAX_NIGHTS };
