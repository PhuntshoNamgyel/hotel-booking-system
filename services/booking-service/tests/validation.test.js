const { validateBooking, isRealDate, countNights } = require('../src/validation');

// A fixed "today", so the tests give the same result on any day.
const TODAY = '2026-10-21';

const good = {
  roomId: 1,
  guestName: 'Gayley Choden',
  guestEmail: 'gayley@example.com',
  checkIn: '2026-11-10',
  checkOut: '2026-11-12',
};

// Helper: the error list for `good` with some fields changed.
const errorsFor = (changes) => validateBooking({ ...good, ...changes }, TODAY).errors;

test('accepts a valid booking and trims the name', () => {
  const { errors, input } = validateBooking({ ...good, guestName: '  Gayley  ' }, TODAY);
  expect(errors).toEqual([]);
  expect(input.guestName).toBe('Gayley');
});

test('rejects a bad roomId', () => {
  expect(errorsFor({ roomId: 0 })).toContain('roomId must be a positive integer');
  expect(errorsFor({ roomId: 'abc' })).toContain('roomId must be a positive integer');
});

test('rejects a name that is too short', () => {
  expect(errorsFor({ guestName: 'A' })).toContain('guestName must be 2 to 100 characters');
});

test('rejects a bad email', () => {
  expect(errorsFor({ guestEmail: 'nope' })).toContain('guestEmail must be a valid email address');
});

test('rejects bad dates', () => {
  expect(errorsFor({ checkIn: '2026-02-30' })).toContain('checkIn and checkOut must be real dates in YYYY-MM-DD format');
  expect(errorsFor({ checkIn: '10/11/2026' })).toContain('checkIn and checkOut must be real dates in YYYY-MM-DD format');
  expect(errorsFor({ checkOut: good.checkIn })).toContain('checkOut must be after checkIn');
});

test('rejects a past checkIn but allows today', () => {
  expect(errorsFor({ checkIn: '2026-10-20' })).toContain('checkIn cannot be in the past');
  expect(errorsFor({ checkIn: TODAY })).toEqual([]);
});

test('allows 30 nights but rejects 31', () => {
  expect(errorsFor({ checkIn: '2026-11-01', checkOut: '2026-12-01' })).toEqual([]);
  expect(errorsFor({ checkIn: '2026-11-01', checkOut: '2026-12-02' })).toContain('Stay cannot be longer than 30 nights');
});

test('helpers work', () => {
  expect(isRealDate('2028-02-29')).toBe(true); // leap year
  expect(isRealDate('2027-02-29')).toBe(false);
  expect(countNights('2026-12-30', '2027-01-02')).toBe(3);
});
