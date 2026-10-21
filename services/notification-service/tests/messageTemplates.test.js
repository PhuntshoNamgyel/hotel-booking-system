const { buildNotification } = require('../src/messageTemplates');

const base = {
  bookingId: 'b-1',
  guestName: 'Tashi',
  checkIn: '2026-11-01',
  checkOut: '2026-11-03',
  totalAmount: 240,
  amount: 240,
};

const types = [
  'BookingCreated',
  'RoomReserved',
  'RoomReservationFailed',
  'PaymentSucceeded',
  'PaymentFailed',
  'BookingConfirmed',
  'BookingFailed',
  'BookingCancelled',
];

test.each(types)('%s gives a title and a message addressed to the guest', (eventType) => {
  const { title, message } = buildNotification({ eventType, data: { ...base, reason: 'PAYMENT_DECLINED' } });
  expect(title.length).toBeGreaterThan(0);
  expect(message).toContain('Tashi');
});

test('BookingCreated shows the dates and the total with 2 decimals', () => {
  const { message } = buildNotification({ eventType: 'BookingCreated', data: base });
  expect(message).toContain('2026-11-01');
  expect(message).toContain('240.00');
});

test('failure reasons are turned into readable text', () => {
  const failed = buildNotification({ eventType: 'BookingFailed', data: { ...base, reason: 'ROOM_UNAVAILABLE' } });
  expect(failed.message).toContain('no longer available');
  const declined = buildNotification({ eventType: 'PaymentFailed', data: { ...base, reason: 'PAYMENT_DECLINED' } });
  expect(declined.message).toContain('declined');
});

test('an unknown event type gets a safe default', () => {
  const { title, message } = buildNotification({ eventType: 'Mystery', data: { bookingId: 'b-9' } });
  expect(title).toBe('Mystery');
  expect(message).toContain('b-9');
});

test('missing data does not throw', () => {
  expect(() => buildNotification({ eventType: 'BookingConfirmed' })).not.toThrow();
  expect(() => buildNotification(undefined)).not.toThrow();
});