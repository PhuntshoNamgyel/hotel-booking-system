jest.mock('../src/messaging', () => ({
  processOnce: jest.fn(),
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/payments');

const { processOnce } = require('../src/messaging');
const { insertPayment, refundPayment } = require('../src/payments');
const adminState = require('../src/adminState');
const { createHandlers } = require('../src/handlers');

const client = {};
const broker = { publish: jest.fn() };
const { handleEvent } = createHandlers({ pool: {}, broker });

const reserved = {
  eventId: 'evt-1',
  eventType: 'RoomReserved',
  correlationId: 'b-1',
  data: {
    bookingId: 'b-1',
    roomId: 3,
    hotelId: 1,
    guestName: 'Tashi',
    guestEmail: 't@example.com',
    checkIn: '2026-11-01',
    checkOut: '2026-11-03',
    totalAmount: 240,
  },
};

const cancelled = {
  eventId: 'evt-c1',
  eventType: 'BookingCancelled',
  correlationId: 'b-1',
  data: { bookingId: 'b-1', roomId: 3, guestName: 'Tashi', guestEmail: 't@example.com' },
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.PAYMENT_LIMIT;
  adminState.setFailureMode(false);
  adminState.setTransientErrors(0);
  broker.publish.mockResolvedValue({});
  insertPayment.mockResolvedValue(true);
  refundPayment.mockResolvedValue(1);
  // Run the work function directly, as if the event was new.
  processOnce.mockImplementation(async (pool, event, work) => ({ duplicate: false, result: await work(client) }));
});

test('RoomReserved saves a SUCCESS payment and publishes PaymentSucceeded', async () => {
  await handleEvent(reserved);
  expect(insertPayment).toHaveBeenCalledWith(
    client,
    expect.objectContaining({ bookingId: 'b-1', amount: 240, status: 'SUCCESS', reason: null })
  );
  expect(broker.publish).toHaveBeenCalledWith(
    'PaymentSucceeded',
    expect.objectContaining({ bookingId: 'b-1', amount: 240, paymentId: expect.any(String), guestEmail: 't@example.com' }),
    { causedBy: 'evt-1' }
  );
});

test('an amount over the limit saves FAILED and publishes PaymentFailed with PAYMENT_DECLINED', async () => {
  await handleEvent({ ...reserved, data: { ...reserved.data, totalAmount: 5000 } });
  expect(insertPayment).toHaveBeenCalledWith(
    client,
    expect.objectContaining({ status: 'FAILED', reason: 'LIMIT_EXCEEDED' })
  );
  expect(broker.publish).toHaveBeenCalledWith(
    'PaymentFailed',
    expect.objectContaining({ bookingId: 'b-1', reason: 'PAYMENT_DECLINED' }),
    { causedBy: 'evt-1' }
  );
});

test('failure mode saves FAILED with FAILURE_MODE and publishes PaymentFailed', async () => {
  adminState.setFailureMode(true);
  await handleEvent(reserved);
  expect(insertPayment).toHaveBeenCalledWith(
    client,
    expect.objectContaining({ status: 'FAILED', reason: 'FAILURE_MODE' })
  );
  expect(broker.publish).toHaveBeenCalledWith(
    'PaymentFailed',
    expect.objectContaining({ reason: 'PAYMENT_DECLINED' }),
    { causedBy: 'evt-1' }
  );
});

test('an invalid amount is stored as 0 with INVALID_AMOUNT', async () => {
  await handleEvent({ ...reserved, data: { ...reserved.data, totalAmount: -5 } });
  expect(insertPayment).toHaveBeenCalledWith(
    client,
    expect.objectContaining({ amount: 0, status: 'FAILED', reason: 'INVALID_AMOUNT' })
  );
});

test('a simulated transient error throws, counts down and publishes nothing', async () => {
  adminState.setTransientErrors(1);
  await expect(handleEvent(reserved)).rejects.toThrow('Simulated transient payment error');
  expect(adminState.getTransientErrors()).toBe(0);
  expect(insertPayment).not.toHaveBeenCalled();
  expect(broker.publish).not.toHaveBeenCalled();
});

test('an existing payment for the booking publishes nothing', async () => {
  insertPayment.mockResolvedValue(false);
  await handleEvent(reserved);
  expect(broker.publish).not.toHaveBeenCalled();
});

test('a duplicate event is ignored', async () => {
  processOnce.mockResolvedValue({ duplicate: true });
  await handleEvent(reserved);
  expect(insertPayment).not.toHaveBeenCalled();
  expect(broker.publish).not.toHaveBeenCalled();
});

test('missing fields throw and name the missing fields', async () => {
  await expect(handleEvent({ ...reserved, data: { bookingId: 'b-1' } })).rejects.toThrow(
    'Missing fields: totalAmount, guestName, guestEmail'
  );
  expect(processOnce).not.toHaveBeenCalled();
});

test('a publish failure makes the handler throw so the message is retried', async () => {
  broker.publish.mockRejectedValue(new Error('broker down'));
  await expect(handleEvent(reserved)).rejects.toThrow('broker down');
});

test('an unknown event type is ignored', async () => {
  await handleEvent({ eventId: 'evt-9', eventType: 'SomethingElse', correlationId: 'b-1', data: {} });
  expect(processOnce).not.toHaveBeenCalled();
  expect(broker.publish).not.toHaveBeenCalled();
});

test('BookingCancelled refunds the payment and publishes nothing', async () => {
  await handleEvent(cancelled);
  expect(refundPayment).toHaveBeenCalledWith(client, 'b-1');
  expect(broker.publish).not.toHaveBeenCalled();
});

test('BookingCancelled for a booking with no successful payment changes nothing and does not fail', async () => {
  refundPayment.mockResolvedValue(0);
  await expect(handleEvent(cancelled)).resolves.toBeUndefined();
  expect(broker.publish).not.toHaveBeenCalled();
});

test('a duplicate BookingCancelled is ignored', async () => {
  processOnce.mockResolvedValue({ duplicate: true });
  await handleEvent(cancelled);
  expect(refundPayment).not.toHaveBeenCalled();
});

test('BookingCancelled without bookingId throws', async () => {
  await expect(handleEvent({ ...cancelled, data: {} })).rejects.toThrow('Missing fields: bookingId');
  expect(processOnce).not.toHaveBeenCalled();
});