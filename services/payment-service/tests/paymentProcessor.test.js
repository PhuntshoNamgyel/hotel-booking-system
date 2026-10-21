const { processPayment } = require('../src/paymentProcessor');

test('a normal amount succeeds', () => {
  expect(processPayment({ amount: 100 }, { failureMode: false, limit: 1000 })).toEqual({
    status: 'SUCCESS',
    reason: null,
  });
});

test('an amount over the limit fails with LIMIT_EXCEEDED', () => {
  expect(processPayment({ amount: 5000 }, { failureMode: false, limit: 1000 })).toEqual({
    status: 'FAILED',
    reason: 'LIMIT_EXCEEDED',
  });
});

test('an amount exactly equal to the limit succeeds', () => {
  expect(processPayment({ amount: 1000 }, { failureMode: false, limit: 1000 }).status).toBe('SUCCESS');
});

test('failure mode makes every payment fail with FAILURE_MODE', () => {
  expect(processPayment({ amount: 100 }, { failureMode: true, limit: 1000 })).toEqual({
    status: 'FAILED',
    reason: 'FAILURE_MODE',
  });
});

test.each([0, -5, '100', NaN, undefined, null])('invalid amount %p fails with INVALID_AMOUNT', (amount) => {
  expect(processPayment({ amount }, { failureMode: false, limit: 1000 })).toEqual({
    status: 'FAILED',
    reason: 'INVALID_AMOUNT',
  });
});

test('the default limit is 1000 when no limit is given', () => {
  delete process.env.PAYMENT_LIMIT;
  expect(processPayment({ amount: 1000 }).status).toBe('SUCCESS');
  expect(processPayment({ amount: 1000.01 }).reason).toBe('LIMIT_EXCEEDED');
});