// Pure function: decides whether a payment succeeds. No database, no network.
// processPayment({ amount }, { failureMode, limit }) -> { status, reason }
function processPayment({ amount }, { failureMode = false, limit } = {}) {
  const max = limit ?? (Number(process.env.PAYMENT_LIMIT) || 1000);

  if (failureMode) {
    return { status: 'FAILED', reason: 'FAILURE_MODE' };
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return { status: 'FAILED', reason: 'INVALID_AMOUNT' };
  }
  if (amount > max) {
    return { status: 'FAILED', reason: 'LIMIT_EXCEEDED' };
  }
  return { status: 'SUCCESS', reason: null };
}

module.exports = { processPayment };