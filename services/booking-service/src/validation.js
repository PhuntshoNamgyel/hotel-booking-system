// Checks the data a guest sends to POST /bookings.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // something@something.something
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// True for a real date such as "2026-11-10".
// "2026-02-30" is false: JavaScript turns it into March 2, so it no longer matches the text.
function isRealDate(text) {
  if (typeof text !== 'string' || !DATE_PATTERN.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

// Number of nights between two dates, for example 2026-11-10 to 2026-11-12 is 2.
function countNights(checkIn, checkOut) {
  const ms = new Date(`${checkOut}T00:00:00Z`) - new Date(`${checkIn}T00:00:00Z`);
  return Math.round(ms / ONE_DAY_MS);
}

// Returns { errors, input }. An empty errors list means the booking is valid.
// `today` is a parameter so the tests can use a fixed date.
function validateBooking(body, today = new Date().toISOString().slice(0, 10)) {
  const errors = [];
  const data = body && typeof body === 'object' ? body : {}; // no body at all: treat it as empty
  const input = {
    roomId: data.roomId,
    guestName: typeof data.guestName === 'string' ? data.guestName.trim() : '',
    guestEmail: typeof data.guestEmail === 'string' ? data.guestEmail.trim() : '',
    checkIn: data.checkIn,
    checkOut: data.checkOut,
  };

  if (!Number.isInteger(input.roomId) || input.roomId <= 0) {
    errors.push('roomId must be a positive integer');
  }
  if (input.guestName.length < 2 || input.guestName.length > 100) {
    errors.push('guestName must be 2 to 100 characters');
  }
  if (!EMAIL_PATTERN.test(input.guestEmail)) {
    errors.push('guestEmail must be a valid email address');
  }

  if (!isRealDate(input.checkIn) || !isRealDate(input.checkOut)) {
    errors.push('checkIn and checkOut must be real dates in YYYY-MM-DD format');
  } else if (input.checkOut <= input.checkIn) {
    // YYYY-MM-DD text sorts in date order, so plain < and > work.
    errors.push('checkOut must be after checkIn');
  } else {
    if (input.checkIn < today) errors.push('checkIn cannot be in the past');
    if (countNights(input.checkIn, input.checkOut) > 30) errors.push('Stay cannot be longer than 30 nights');
  }

  return { errors, input };
}

module.exports = { isRealDate, countNights, validateBooking };
