const adminState = require('../src/adminState');

beforeEach(() => {
  adminState.setFailureMode(false);
  adminState.setTransientErrors(0);
});

test('consumeTransientError counts down and then returns false', () => {
  adminState.setTransientErrors(2);
  expect(adminState.consumeTransientError()).toBe(true);
  expect(adminState.consumeTransientError()).toBe(true);
  expect(adminState.consumeTransientError()).toBe(false);
  expect(adminState.getTransientErrors()).toBe(0);
});