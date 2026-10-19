// Prints one JSON line per log entry, which is easy to read and search.
function createLogger(service) {
  const write = (level, message, meta = {}) => {
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      service,
      message,
      ...meta,
    });
    if (level === 'error') console.error(line);
    else console.log(line);
  };
  return {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  };
}

module.exports = { createLogger };