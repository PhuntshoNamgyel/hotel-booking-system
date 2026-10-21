const { validateBookingInput, isRealDate, countNights } = require('../src/validation');

// A fixed "today" so the tests give the same result on any day.
const TODAY = '2026-10-21';

const good = {
  roomId: 1,
  guestName: 'Gayley Choden',
  guestEmail: 'gayley@example.com',
  checkIn: '2026-11-10',
  checkOut: '2026-11-12',
};

test('accepts a valid booking and trims text', () => {
  const { value, errors } = validateBookingInput({ ...good, guestName: '  Gayley  ' }, TODAY);
  expect(errors).toBeUndefined();
  expect(value.guestName).toBe('Gayley');
  expect(value.roomId).toBe(1);
});

test('accepts roomId sent as a string of digits', () => {
  expect(validateBookingInput({ ...good, roomId: '3' }, TODAY).value.roomId).toBe(3);
});

test('rejects a bad roomId', () => {
  for (const roomId of [0, -1, 1.5, 'abc', undefined]) {
    expect(validateBookingInput({ ...good, roomId }, TODAY).errors).toContain('roomId must be a positive integer');
  }
});

test('rejects a name that is too short', () => {
  expect(validateBookingInput({ ...good, guestName: ' A ' }, TODAY).errors)
    .toContain('guestName must be 2 to 100 characters');
});

test('rejects a bad email', () => {
  for (const guestEmail of ['nope', 'a@b', 'a b@c.com', '']) {
    expect(validateBookingInput({ ...good, guestEmail }, TODAY).errors)
      .toContain('guestEmail must be a valid email address');
  }
});

test('rejects dates that are not real or not YYYY-MM-DD', () => {
  for (const checkIn of ['2026-02-30', '10/11/2026', '2026-1-5']) {
    expect(validateBookingInput({ ...good, checkIn }, TODAY).errors)
      .toContain('checkIn and checkOut must be real dates in YYYY-MM-DD format');
  }
});

test('rejects checkOut on or before checkIn', () => {
  expect(validateBookingInput({ ...good, checkOut: good.checkIn }, TODAY).errors)
    .toContain('checkOut must be after checkIn');
});

test('rejects a checkIn in the past but allows today', () => {
  expect(validateBookingInput({ ...good, checkIn: '2026-10-20' }, TODAY).errors)
    .toContain('checkIn cannot be in the past');
  expect(validateBookingInput({ ...good, checkIn: TODAY }, TODAY).errors).toBeUndefined();
});

test('allows 30 nights but rejects 31', () => {
  expect(validateBookingInput({ ...good, checkIn: '2026-11-01', checkOut: '2026-12-01' }, TODAY).errors)
    .toBeUndefined();
  expect(validateBookingInput({ ...good, checkIn: '2026-11-01', checkOut: '2026-12-02' }, TODAY).errors)
    .toContain('Stay cannot be longer than 30 nights');
});

test('returns every problem at once for an empty body', () => {
  expect(validateBookingInput(undefined, TODAY).errors).toHaveLength(4);
});

test('helpers', () => {
  expect(isRealDate('2028-02-29')).toBe(true);
  expect(isRealDate('2027-02-29')).toBe(false);
  expect(countNights('2026-12-30', '2027-01-02')).toBe(3);
});
