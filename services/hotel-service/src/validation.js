const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// True only for real calendar dates written as YYYY-MM-DD.
function isRealDate(value) {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Dates are optional, but if one is given both must be valid and in order.
// Returns { range } on success (range is null when no dates were given) or { error }.
function parseDateRange(checkIn, checkOut) {
  if (checkIn === undefined && checkOut === undefined) return { range: null };
  if (!checkIn || !checkOut) return { error: 'Provide both checkIn and checkOut' };
  if (!isRealDate(checkIn) || !isRealDate(checkOut)) {
    return { error: 'Dates must be real dates in YYYY-MM-DD format' };
  }
  if (checkOut <= checkIn) return { error: 'checkOut must be after checkIn' };
  return { range: { checkIn, checkOut } };
}

// Route ids must be positive whole numbers. Returns null when invalid.
function parseId(value) {
  return /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null;
}

module.exports = { isRealDate, parseDateRange, parseId };