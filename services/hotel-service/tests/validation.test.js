const { isRealDate, parseDateRange, parseId } = require('../src/validation');

test('isRealDate accepts real dates and rejects fake ones', () => {
  expect(isRealDate('2026-11-01')).toBe(true);
  expect(isRealDate('2026-02-30')).toBe(false);
  expect(isRealDate('01-11-2026')).toBe(false);
  expect(isRealDate('hello')).toBe(false);
});

test('parseDateRange allows no dates', () => {
  expect(parseDateRange(undefined, undefined)).toEqual({ range: null });
});

test('parseDateRange requires both dates', () => {
  expect(parseDateRange('2026-11-01', undefined).error).toBeDefined();
});

test('parseDateRange rejects checkOut on or before checkIn', () => {
  expect(parseDateRange('2026-11-03', '2026-11-03').error).toBeDefined();
  expect(parseDateRange('2026-11-05', '2026-11-03').error).toBeDefined();
});

test('parseDateRange accepts a valid range', () => {
  expect(parseDateRange('2026-11-01', '2026-11-03')).toEqual({
    range: { checkIn: '2026-11-01', checkOut: '2026-11-03' },
  });
});

test('parseId accepts positive integers only', () => {
  expect(parseId('3')).toBe(3);
  expect(parseId('0')).toBeNull();
  expect(parseId('abc')).toBeNull();
  expect(parseId('-1')).toBeNull();
});