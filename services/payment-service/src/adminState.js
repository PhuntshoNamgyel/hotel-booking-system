// In-memory demo switches. They reset to these values when the service restarts.
const state = { failureMode: false, transientErrors: 0 };

function getFailureMode() {
  return state.failureMode;
}

function setFailureMode(enabled) {
  state.failureMode = enabled;
}

function getTransientErrors() {
  return state.transientErrors;
}

function setTransientErrors(count) {
  state.transientErrors = count;
}

// Used by the RoomReserved handler in Step 3.
// Returns true (and counts down) while simulated errors remain.
function consumeTransientError() {
  if (state.transientErrors > 0) {
    state.transientErrors -= 1;
    return true;
  }
  return false;
}

module.exports = {
  getFailureMode,
  setFailureMode,
  getTransientErrors,
  setTransientErrors,
  consumeTransientError,
};